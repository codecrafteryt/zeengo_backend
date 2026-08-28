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
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { NotificationsService } from '../notifications/notifications.service';
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
  COMMITTED_ASSIGNMENT_STATUSES,
  OPEN_ASSIGNMENT_STATUSES,
  openAssignmentWhere,
} from './assignment.util';
import { RejectAssignmentDto } from './assignment.schema';
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
    private readonly realtime: RealtimeEmitter,
    private readonly notifications: NotificationsService,
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
            where: openAssignmentWhere(),
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
          where: openAssignmentWhere(),
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
          where: openAssignmentWhere(),
          take: 1,
          include: { booking: { include: { client: true } } },
        },
      },
    });

    const mapped = mapDriverListItem(row);
    this.realtime.emit('driver.updated', mapped);
    return mapped;
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
          driverAssignments: { none: openAssignmentWhere() },
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
        driverAssignments: { none: openAssignmentWhere() },
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
          where: openAssignmentWhere(),
          orderBy: { createdAt: 'desc' },
          take: 5,
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
    const day = this.formatDate(date);

    const rows = await this.prisma.itineraryItem.findMany({
      where: {
        OR: [
          { driverId, itemDate: date },
          {
            booking: {
              driverAssignments: {
                some: {
                  driverId,
                  status: { in: OPEN_ASSIGNMENT_STATUSES },
                  startDate: { lte: date },
                  OR: [{ endDate: null }, { endDate: { gte: date } }],
                },
              },
            },
          },
        ],
      },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
      include: {
        booking: { include: { client: true } },
      },
    });

    const items = rows.filter((row) => {
      const itemDay = row.itemDate
        ? this.formatDate(row.itemDate)
        : row.booking.arrivalDate
          ? this.formatDate(
              new Date(
                Date.UTC(
                  row.booking.arrivalDate.getUTCFullYear(),
                  row.booking.arrivalDate.getUTCMonth(),
                  row.booking.arrivalDate.getUTCDate() + (row.dayNumber - 1),
                ),
              ),
            )
          : null;
      return itemDay === day;
    });

    return {
      date: day,
      items: items.map(mapScheduleItem),
    };
  }

  async getTrips(driverId: string) {
    await this.ensureDriverProfile(driverId);

    const rows = await this.prisma.driverAssignment.findMany({
      where: {
        driverId,
        status: {
          in: [
            AssignmentStatus.completed,
            AssignmentStatus.in_progress,
            AssignmentStatus.accepted,
            AssignmentStatus.active,
          ],
        },
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
      this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        include: { client: true },
      }),
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

    const openOnDriver = await this.prisma.driverAssignment.findFirst({
      where: openAssignmentWhere({ driverId: dto.driverId }),
    });
    if (openOnDriver && openOnDriver.bookingId !== dto.bookingId) {
      throw AppError.conflict(
        'DRIVER_BUSY',
        'Driver already has an open assignment',
      );
    }

    const startDate = new Date(dto.startDate ?? this.formatDate(new Date()));

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.driverAssignment.updateMany({
          where: openAssignmentWhere({ bookingId: dto.bookingId }),
          data: { status: AssignmentStatus.cancelled },
        });

        const existing = await tx.driverAssignment.findFirst({
          where: {
            bookingId: dto.bookingId,
            driverId: dto.driverId,
            startDate,
          },
        });

        const assignment = existing
          ? await tx.driverAssignment.update({
              where: { id: existing.id },
              data: {
                status: AssignmentStatus.pending,
                assignedBy,
                endDate: dto.endDate ? new Date(dto.endDate) : null,
                acceptedAt: null,
                rejectedAt: null,
                rejectedReason: null,
                startedAt: null,
                completedAt: null,
              },
              include: { booking: { include: { client: true } } },
            })
          : await tx.driverAssignment.create({
              data: {
                bookingId: dto.bookingId,
                driverId: dto.driverId,
                startDate,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                status: AssignmentStatus.pending,
                assignedBy,
              },
              include: {
                booking: { include: { client: true } },
              },
            });

        return assignment;
      });

      await this.prisma.itineraryItem.updateMany({
        where: { bookingId: dto.bookingId },
        data: { driverId: dto.driverId },
      });

      const mapped = mapAssignment(row);
      await this.notifications.createAndFanout({
        staffId: driver.userId,
        type: 'assignment',
        title: `New assignment: ${booking.znCode}`,
        body: `${booking.client.fullName} — tap to accept or decline.`,
        data: {
          assignmentId: row.id,
          bookingId: row.bookingId,
          znCode: booking.znCode,
          status: row.status,
        },
      });
      this.emitAssignment('assignment.created', mapped);
      return mapped;
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

  async acceptMyAssignment(user: AuthPrincipal, assignmentId: string) {
    const profile = await this.requireDriverProfile(user);
    const existing = await this.requireMyAssignment(profile.id, assignmentId);

    if (existing.status !== AssignmentStatus.pending) {
      throw AppError.conflict(
        'ASSIGNMENT_NOT_PENDING',
        'Only pending assignments can be accepted',
      );
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.driverAssignment.updateMany({
        where: openAssignmentWhere({
          bookingId: existing.bookingId,
          id: { not: assignmentId },
        }),
        data: { status: AssignmentStatus.cancelled },
      });

      const updated = await tx.driverAssignment.update({
        where: { id: assignmentId },
        data: { status: AssignmentStatus.accepted, acceptedAt: now },
        include: { booking: { include: { client: true } } },
      });

      await tx.itineraryItem.updateMany({
        where: { bookingId: existing.bookingId },
        data: { driverId: profile.id },
      });

      return updated;
    });

    const mapped = mapAssignment(row);
    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'assignment',
      title: `Driver accepted ${row.booking.znCode}`,
      body: `${profile.user.fullName} accepted the assignment.`,
      data: { assignmentId: row.id, bookingId: row.bookingId, status: row.status },
    });
    await this.notifications.createAndFanout({
      clientId: row.booking.clientId,
      type: 'assignment',
      title: 'Your driver confirmed',
      body: `${profile.user.fullName} will be your driver.`,
      data: {
        assignmentId: row.id,
        bookingId: row.bookingId,
        status: row.status,
      },
    });
    this.emitAssignment('assignment.accepted', mapped);
    return mapped;
  }

  async rejectMyAssignment(
    user: AuthPrincipal,
    assignmentId: string,
    dto: RejectAssignmentDto,
  ) {
    const profile = await this.requireDriverProfile(user);
    const existing = await this.requireMyAssignment(profile.id, assignmentId);

    if (existing.status !== AssignmentStatus.pending) {
      throw AppError.conflict(
        'ASSIGNMENT_NOT_PENDING',
        'Only pending assignments can be rejected',
      );
    }

    const now = new Date();
    const row = await this.prisma.driverAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.rejected,
        rejectedAt: now,
        rejectedReason: dto.reason,
      },
      include: { booking: { include: { client: true } } },
    });

    await this.prisma.itineraryItem.updateMany({
      where: { bookingId: row.bookingId, driverId: profile.id },
      data: { driverId: null },
    });

    const mapped = mapAssignment(row);
    await this.notifications.createAndFanout({
      staffId: row.assignedBy,
      type: 'assignment',
      title: `Driver declined ${row.booking.znCode}`,
      body: dto.reason,
      data: { assignmentId: row.id, bookingId: row.bookingId, status: row.status },
    });
    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'assignment',
      title: `Assignment declined: ${row.booking.znCode}`,
      body: `${profile.user.fullName}: ${dto.reason}`,
      data: { assignmentId: row.id, bookingId: row.bookingId, status: row.status },
    });
    this.emitAssignment('assignment.rejected', mapped);
    return mapped;
  }

  async startMyAssignment(user: AuthPrincipal, assignmentId: string) {
    const profile = await this.requireDriverProfile(user);
    const existing = await this.requireMyAssignment(profile.id, assignmentId);

    if (
      existing.status !== AssignmentStatus.accepted &&
      existing.status !== AssignmentStatus.active
    ) {
      throw AppError.conflict(
        'ASSIGNMENT_NOT_ACCEPTED',
        'Accept the assignment before starting the trip',
      );
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverAssignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.in_progress,
          startedAt: now,
        },
        include: { booking: { include: { client: true } } },
      });

      await tx.driverProfile.update({
        where: { id: profile.id },
        data: { status: DriverStatus.en_route },
      });

      return updated;
    });

    const mapped = mapAssignment(row);
    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'assignment',
      title: `Trip started: ${row.booking.znCode}`,
      body: `${profile.user.fullName} is en route.`,
      data: { assignmentId: row.id, bookingId: row.bookingId, status: row.status },
    });
    await this.notifications.createAndFanout({
      clientId: row.booking.clientId,
      type: 'assignment',
      title: 'Your driver is on the way',
      body: `${profile.user.fullName} has started your trip.`,
      data: {
        assignmentId: row.id,
        bookingId: row.bookingId,
        status: row.status,
      },
    });
    this.emitAssignment('assignment.started', mapped);
    return mapped;
  }

  async completeMyAssignment(user: AuthPrincipal, assignmentId: string) {
    const profile = await this.requireDriverProfile(user);
    const existing = await this.requireMyAssignment(profile.id, assignmentId);

    if (
      existing.status !== AssignmentStatus.in_progress &&
      existing.status !== AssignmentStatus.active
    ) {
      throw AppError.conflict(
        'ASSIGNMENT_NOT_IN_PROGRESS',
        'Start the trip before completing the assignment',
      );
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverAssignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.completed,
          completedAt: now,
        },
        include: { booking: { include: { client: true } } },
      });

      await tx.driverProfile.update({
        where: { id: profile.id },
        data: { status: DriverStatus.available },
      });

      return updated;
    });

    const mapped = mapAssignment(row);
    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'assignment',
      title: `Trip completed: ${row.booking.znCode}`,
      body: `${profile.user.fullName} marked the assignment complete.`,
      data: { assignmentId: row.id, bookingId: row.bookingId, status: row.status },
    });
    await this.notifications.createAndFanout({
      clientId: row.booking.clientId,
      type: 'assignment',
      title: 'Trip completed',
      body: `Your trip with ${profile.user.fullName} is complete.`,
      data: {
        assignmentId: row.id,
        bookingId: row.bookingId,
        status: row.status,
      },
    });
    this.emitAssignment('assignment.completed', mapped);
    return mapped;
  }

  async deleteAssignment(id: string) {
    const existing = await this.prisma.driverAssignment.findUnique({
      where: { id },
      include: { booking: { include: { client: true } } },
    });
    if (!existing) {
      throw AppError.notFound('ASSIGNMENT_NOT_FOUND', 'Assignment not found');
    }

    const row = await this.prisma.driverAssignment.update({
      where: { id },
      data: { status: AssignmentStatus.cancelled },
      include: { booking: { include: { client: true } } },
    });

    if (existing.status !== AssignmentStatus.rejected) {
      await this.prisma.itineraryItem.updateMany({
        where: { bookingId: row.bookingId, driverId: row.driverId },
        data: { driverId: null },
      });
    }

    const mapped = mapAssignment(row);
    this.emitAssignment('assignment.cancelled', mapped);
    return { deleted: true, assignment: mapped };
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
      const assigned = await this.prisma.driverAssignment.findFirst({
        where: {
          bookingId: item.bookingId,
          driverId: profile.id,
          status: { in: COMMITTED_ASSIGNMENT_STATUSES },
        },
      });
      if (!assigned) {
        throw AppError.forbidden();
      }
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
          where: openAssignmentWhere(),
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
          where: openAssignmentWhere(),
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

    const mapped = mapDriverListItem(row);
    this.realtime.emit('driver.updated', mapped);
    return mapped;
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

    const result = {
      driverId: profile.id,
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: payload.recordedAt,
    };

    this.realtime.emit('driver.gps', {
      ...result,
      driverName: profile.user.fullName,
      status: profile.status,
    });

    return result;
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

  private async requireMyAssignment(driverId: string, assignmentId: string) {
    const row = await this.prisma.driverAssignment.findUnique({
      where: { id: assignmentId },
      include: { booking: { include: { client: true } } },
    });
    if (!row || row.driverId !== driverId) {
      throw AppError.notFound('ASSIGNMENT_NOT_FOUND', 'Assignment not found');
    }
    return row;
  }

  private emitAssignment(event: string, payload: ReturnType<typeof mapAssignment>) {
    this.realtime.emit(event, payload);
    this.realtime.emit('driver.updated', {
      driverId: payload.driverId,
      bookingId: payload.bookingId,
      assignmentStatus: payload.status,
    });
  }
}
