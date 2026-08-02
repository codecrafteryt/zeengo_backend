import { Injectable } from '@nestjs/common';
import { AssignmentStatus, DriverStatus, Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import {
  CreateAssignmentDto,
  GpsPingDto,
  ListDriversQuery,
  ScheduleQuery,
  UpdateDriverDto,
  UpdateMyStatusDto,
} from './drivers.schema';
import {
  mapAssignment,
  mapDriverDetail,
  mapDriverListItem,
  mapDriverTrip,
  mapLivePosition,
  mapScheduleItem,
} from './drivers.mapper';

const GPS_KEY_PREFIX = 'driver:gps:';
const GPS_ACTIVE_SET = 'driver:gps:active';

type GpsCachePayload = {
  lat: number;
  lng: number;
  recordedAt: string;
  status?: string;
};

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(query: ListDriversQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.DriverProfileWhereInput = {
      user: { deletedAt: null, isActive: true },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { plateNumber: { contains: term, mode: 'insensitive' } },
        { user: { fullName: { contains: term, mode: 'insensitive' } } },
        { user: { phone: { contains: term } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const orderBy = parseSort(query.sort, ['createdAt', 'status', 'tripsCount'], {
      field: 'createdAt',
      dir: 'desc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { user: true },
      }),
      this.prisma.driverProfile.count({ where }),
    ]);

    const data = rows.map((row) => mapDriverListItem(row));

    return { data, meta: pageMeta(total, page, limit) };
  }

  async getById(id: string) {
    const row = await this.prisma.driverProfile.findUnique({
      where: { id },
      include: {
        user: true,
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          orderBy: { startDate: 'desc' },
          include: {
            booking: { include: { client: true } },
          },
        },
      },
    });

    if (!row || row.user.deletedAt) {
      throw AppError.notFound('DRIVER_NOT_FOUND', 'Driver not found');
    }

    return mapDriverDetail(row, row.driverAssignments);
  }

  async update(id: string, dto: UpdateDriverDto) {
    await this.ensureDriverProfile(id);

    const row = await this.prisma.driverProfile.update({
      where: { id },
      data: {
        vehicleMake: dto.vehicleMake,
        vehicleModel: dto.vehicleModel,
        vehicleColor: dto.vehicleColor,
        vehicleYear: dto.vehicleYear,
        plateNumber: dto.plateNumber,
        whatsapp: dto.whatsapp,
        status: dto.status,
      },
      include: { user: true },
    });

    return mapDriverListItem(row);
  }

  async getSchedule(driverId: string, query: ScheduleQuery) {
    await this.ensureDriverProfile(driverId);
    const date = this.resolveDate(query.date);

    const rows = await this.prisma.itineraryItem.findMany({
      where: { driverId, itemDate: date },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
      include: {
        booking: { include: { client: true } },
      },
    });

    return {
      date: this.formatDate(date),
      items: rows.map(mapScheduleItem),
    };
  }

  async getTrips(driverId: string) {
    await this.ensureDriverProfile(driverId);

    const rows = await this.prisma.driverAssignment.findMany({
      where: {
        driverId,
        status: { in: [AssignmentStatus.completed, AssignmentStatus.active] },
      },
      orderBy: { startDate: 'desc' },
      include: {
        booking: { include: { client: true } },
      },
    });

    return rows.map(mapDriverTrip);
  }

  async createAssignment(dto: CreateAssignmentDto, assignedBy: string) {
    const [booking, driver] = await Promise.all([
      this.prisma.booking.findUnique({ where: { id: dto.bookingId } }),
      this.prisma.driverProfile.findUnique({
        where: { id: dto.driverId },
        include: { user: true },
      }),
    ]);

    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (!driver || driver.user.deletedAt) {
      throw AppError.notFound('DRIVER_NOT_FOUND', 'Driver not found');
    }

    try {
      const row = await this.prisma.driverAssignment.create({
        data: {
          bookingId: dto.bookingId,
          driverId: dto.driverId,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          assignedBy,
        },
        include: {
          booking: { include: { client: true } },
        },
      });

      return mapAssignment(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw AppError.conflict(
          'ASSIGNMENT_EXISTS',
          'Driver already assigned for this booking on that start date',
        );
      }
      throw err;
    }
  }

  async deleteAssignment(id: string) {
    const existing = await this.prisma.driverAssignment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw AppError.notFound('ASSIGNMENT_NOT_FOUND', 'Assignment not found');
    }

    await this.prisma.driverAssignment.update({
      where: { id },
      data: { status: AssignmentStatus.cancelled },
    });

    return { deleted: true };
  }

  async getMySchedule(user: AuthPrincipal, query: ScheduleQuery) {
    const profile = await this.requireDriverProfile(user);
    return this.getSchedule(profile.id, query);
  }

  async updateMyStatus(user: AuthPrincipal, dto: UpdateMyStatusDto) {
    const profile = await this.requireDriverProfile(user);

    const row = await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: { status: dto.status },
      include: { user: true },
    });

    const gpsKey = `${GPS_KEY_PREFIX}${profile.id}`;
    const cached = await this.redis.getJson<GpsCachePayload>(gpsKey);
    if (cached) {
      await this.redis.setJson(gpsKey, { ...cached, status: dto.status });
    }

    return mapDriverListItem(row);
  }

  async recordGps(user: AuthPrincipal, dto: GpsPingDto) {
    const profile = await this.requireDriverProfile(user);
    const now = new Date();

    const payload: GpsCachePayload = {
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: now.toISOString(),
      status: profile.status,
    };

    const gpsKey = `${GPS_KEY_PREFIX}${profile.id}`;
    await Promise.all([
      this.redis.setJson(gpsKey, payload),
      this.redis.raw.sadd(GPS_ACTIVE_SET, profile.id),
      this.prisma.driverProfile.update({
        where: { id: profile.id },
        data: {
          lastLat: dto.lat,
          lastLng: dto.lng,
          lastGpsAt: now,
        },
      }),
    ]);

    return {
      driverId: profile.id,
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: payload.recordedAt,
    };
  }

  async getLivePositions() {
    const driverIds = await this.redis.raw.smembers(GPS_ACTIVE_SET);
    if (driverIds.length === 0) {
      return [];
    }

    const keys = driverIds.map((id) => `${GPS_KEY_PREFIX}${id}`);
    const values = await this.redis.raw.mget(...keys);

    const profiles = await this.prisma.driverProfile.findMany({
      where: { id: { in: driverIds } },
      include: { user: true },
    });
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const positions = driverIds.flatMap((driverId, index) => {
      const raw = values[index];
      if (!raw) return [];

      const profile = profileMap.get(driverId);
      if (!profile) return [];

      const payload = JSON.parse(raw) as GpsCachePayload;
      return [
        mapLivePosition(
          driverId,
          profile.user.fullName,
          payload.status ?? profile.status,
          payload,
        ),
      ];
    });

    return positions;
  }

  private async requireDriverProfile(user: AuthPrincipal) {
    if (user.type !== 'staff' || user.role !== StaffRole.driver) {
      throw AppError.forbidden();
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: user.sub },
      include: { user: true },
    });

    if (!profile) {
      throw AppError.notFound('DRIVER_PROFILE_NOT_FOUND', 'Driver profile not found');
    }

    return profile;
  }

  private async ensureDriverProfile(id: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { id } });
    if (!profile) {
      throw AppError.notFound('DRIVER_NOT_FOUND', 'Driver not found');
    }
    return profile;
  }

  private resolveDate(input: string): Date {
    const base = new Date();
    base.setUTCHours(0, 0, 0, 0);

    if (input === 'today') {
      return base;
    }
    if (input === 'tomorrow') {
      base.setUTCDate(base.getUTCDate() + 1);
      return base;
    }
    return new Date(input);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
