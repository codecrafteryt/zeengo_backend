import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BookingStatus,
  DriverStatus,
  Prisma,
  StaffRole,
} from '@prisma/client';
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
  UpdateMyScheduleItemDto,
  UpdateMyStatusDto,
  UpdateMyVehicleDto,
} from './drivers.schema';
import {
  mapAssignment,
  mapDriverDetail,
  mapDriverListItem,
  mapDriverTrip,
  mapLivePosition,
  mapScheduleItem,
  type DriverStatsDto,
  type UnassignedBookingDto,
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
        include: {
          user: true,
          driverAssignments: {
            where: { status: AssignmentStatus.active },
            take: 1,
            orderBy: { startDate: 'desc' },
            include: { booking: { include: { client: true } } },
          },
        },
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
      include: {
        user: true,
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          take: 1,
          include: { booking: { include: { client: true } } },
        },
      },
    });

    return mapDriverListItem(row);
  }

  async getStats(): Promise<DriverStatsDto> {
    const [grouped, unassignedBookings] = await Promise.all([
      this.prisma.driverProfile.groupBy({
        by: ['status'],
        where: { user: { deletedAt: null, isActive: true } },
        _count: { _all: true },
      }),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.active,
          driverAssignments: { none: { status: AssignmentStatus.active } },
        },
      }),
    ]);

    const counts = {
      total: 0,
      available: 0,
      enRoute: 0,
      resting: 0,
      offDuty: 0,
      unassignedBookings,
    };

    for (const row of grouped) {
      counts.total += row._count._all;
      if (row.status === DriverStatus.available) counts.available = row._count._all;
      else if (row.status === DriverStatus.en_route) counts.enRoute = row._count._all;
      else if (row.status === DriverStatus.resting) counts.resting = row._count._all;
      else if (row.status === DriverStatus.off_duty) counts.offDuty = row._count._all;
    }

    return counts;
  }

  async listUnassignedBookings(): Promise<UnassignedBookingDto[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.active,
        driverAssignments: { none: { status: AssignmentStatus.active } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { client: true, package: true },
    });

    return rows.map((row) => ({
      bookingId: row.id,
      znCode: row.znCode,
      clientName: row.client.fullName,
      clientPhone: row.client.phone ?? null,
      packageName: row.package?.name ?? null,
      arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
      departureDate: row.departureDate?.toISOString().slice(0, 10) ?? null,
      isVip: row.isVip,
    }));
  }

  async getMe(user: AuthPrincipal) {
    const profile = await this.requireDriverProfile(user);
    const row = await this.prisma.driverProfile.findUnique({
      where: { id: profile.id },
      include: {
        user: true,
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          orderBy: { startDate: 'desc' },
          include: { booking: { include: { client: true } } },
        },
      },
    });
    if (!row) {
      throw AppError.notFound('DRIVER_PROFILE_NOT_FOUND', 'Driver profile not found');
    }
    return mapDriverDetail(row, row.driverAssignments);
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
      const row = await this.prisma.$transaction(async (tx) => {
        // One active assignment per booking — reassign replaces previous.
        await tx.driverAssignment.updateMany({
          where: {
            bookingId: dto.bookingId,
            status: AssignmentStatus.active,
          },
          data: { status: AssignmentStatus.cancelled },
        });

        return tx.driverAssignment.create({
          data: {
            bookingId: dto.bookingId,
            driverId: dto.driverId,
            startDate: new Date(dto.startDate ?? this.formatDate(new Date())),
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            assignedBy,
          },
          include: {
            booking: { include: { client: true } },
          },
        });
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

  async updateMyScheduleItem(
    user: AuthPrincipal,
    itemId: string,
    dto: UpdateMyScheduleItemDto,
  ) {
    const profile = await this.requireDriverProfile(user);
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw AppError.notFound('ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found');
    }
    if (item.driverId !== profile.id) {
      throw AppError.forbidden();
    }

    const row = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: { status: dto.status },
      include: { booking: { include: { client: true } } },
    });

    return mapScheduleItem(row);
  }

  async updateMyVehicle(user: AuthPrincipal, dto: UpdateMyVehicleDto) {
    const profile = await this.requireDriverProfile(user);
    const row = await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        vehicleMake: dto.vehicleMake,
        vehicleModel: dto.vehicleModel,
        vehicleColor: dto.vehicleColor ?? null,
        vehicleYear: dto.vehicleYear ?? null,
        plateNumber: dto.plateNumber,
        whatsapp: dto.whatsapp ?? null,
      },
      include: {
        user: true,
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          take: 1,
          include: { booking: { include: { client: true } } },
        },
      },
    });
    return mapDriverListItem(row);
  }

  async updateMyStatus(user: AuthPrincipal, dto: UpdateMyStatusDto) {
    const profile = await this.requireDriverProfile(user);

    const row = await this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: { status: dto.status },
      include: {
        user: true,
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          take: 1,
          include: { booking: { include: { client: true } } },
        },
      },
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
    const redisIds = await this.redis.raw.smembers(GPS_ACTIVE_SET);
    const keys = redisIds.map((id) => `${GPS_KEY_PREFIX}${id}`);
    const values = keys.length ? await this.redis.raw.mget(...keys) : [];

    // Prefer live Redis pings; fall back to last known GPS on driver profiles
    // so the Operations Room works even before drivers report in.
    const profiles = await this.prisma.driverProfile.findMany({
      where: { user: { deletedAt: null, isActive: true } },
      include: { user: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const redisMap = new Map<string, GpsCachePayload>();
    redisIds.forEach((driverId, index) => {
      const raw = values[index];
      if (!raw) return;
      try {
        redisMap.set(driverId, JSON.parse(raw) as GpsCachePayload);
      } catch {
        /* ignore bad payload */
      }
    });

    return profiles.flatMap((profile) => {
      const cached = redisMap.get(profile.id);
      if (cached) {
        return [
          mapLivePosition(
            profile.id,
            profile.user.fullName,
            cached.status ?? profile.status,
            cached,
          ),
        ];
      }
      if (profile.lastLat == null || profile.lastLng == null) {
        // Deterministic placeholder near Moscow when GPS never reported
        const hash = profile.id
          .split('')
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const dLat = ((hash % 100) - 50) / 2500;
        const dLng = (((hash * 7) % 100) - 50) / 2500;
        return [
          mapLivePosition(profile.id, profile.user.fullName, profile.status, {
            lat: 55.7558 + dLat,
            lng: 37.6173 + dLng,
            recordedAt: profile.lastGpsAt?.toISOString() ?? new Date().toISOString(),
          }),
        ];
      }
      return [
        mapLivePosition(profile.id, profile.user.fullName, profile.status, {
          lat: profile.lastLat,
          lng: profile.lastLng,
          recordedAt: profile.lastGpsAt?.toISOString() ?? new Date().toISOString(),
        }),
      ];
    });
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
