import { Injectable } from '@nestjs/common';
import { AssignmentStatus, Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import {
  CreateReviewDto,
  ListReviewsQuery,
  ReviewsStatsQuery,
} from './reviews.schema';
import {
  mapDriverReview,
  type DriverReviewsStatsDto,
} from './reviews.mapper';

const STAFF_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
];

const reviewInclude = {
  booking: { select: { znCode: true } },
  client: { select: { fullName: true } },
  driver: { include: { user: { select: { fullName: true } } } },
} satisfies Prisma.DriverReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListReviewsQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    return this.listInternal(query);
  }

  async listForDriver(driverId: string, query: ListReviewsQuery, user: AuthPrincipal) {
    if (user.type === 'client') {
      throw AppError.forbidden();
    }
    if (user.role === StaffRole.driver) {
      const profile = await this.requireDriverProfile(user.sub);
      if (profile.id !== driverId) throw AppError.forbidden();
    } else {
      this.assertStaffRead(user);
    }
    return this.listInternal({ ...query, driverId });
  }

  async listMineAsDriver(user: AuthPrincipal, query: ListReviewsQuery) {
    const profile = await this.requireDriverProfile(user.sub);
    return this.listInternal({ ...query, driverId: profile.id });
  }

  async listMineAsClient(user: AuthPrincipal, query: ListReviewsQuery) {
    if (user.type !== 'client') throw AppError.forbidden();
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.DriverReviewWhereInput = { clientId: user.sub };
    const [rows, total] = await Promise.all([
      this.prisma.driverReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: reviewInclude,
      }),
      this.prisma.driverReview.count({ where }),
    ]);
    return { data: rows.map(mapDriverReview), meta: pageMeta(total, page, limit) };
  }

  async stats(query: ReviewsStatsQuery, user: AuthPrincipal): Promise<DriverReviewsStatsDto> {
    if (user.type === 'client') throw AppError.forbidden();
    if (user.role === StaffRole.driver) {
      const profile = await this.requireDriverProfile(user.sub);
      if (query.driverId && query.driverId !== profile.id) throw AppError.forbidden();
      return this.computeStats(profile.id);
    }
    this.assertStaffRead(user);
    return this.computeStats(query.driverId);
  }

  async createOrUpdate(dto: CreateReviewDto, user: AuthPrincipal) {
    if (user.type !== 'client') {
      throw AppError.forbidden('Only the guest app can submit driver reviews');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        driverAssignments: {
          where: { status: { in: [AssignmentStatus.active, AssignmentStatus.completed] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking || booking.clientId !== user.sub) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (booking.status === 'cancelled') {
      throw AppError.validation('Cannot review a cancelled booking');
    }

    const assignment = dto.driverId
      ? booking.driverAssignments.find((a) => a.driverId === dto.driverId)
      : booking.driverAssignments[0];

    if (!assignment) {
      throw AppError.validation(
        'This booking has no assigned driver to review yet',
      );
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.driverReview.upsert({
        where: {
          bookingId_driverId: {
            bookingId: booking.id,
            driverId: assignment.driverId,
          },
        },
        create: {
          bookingId: booking.id,
          clientId: user.sub,
          driverId: assignment.driverId,
          rating: dto.rating,
          comment,
        },
        update: {
          rating: dto.rating,
          comment,
        },
        include: reviewInclude,
      });

      await this.recalcDriverRating(tx, assignment.driverId);
      return saved;
    });

    await this.audit.log({
      actorType: 'client',
      actorId: user.sub,
      action: 'driver_review.upsert',
      entity: 'driver_review',
      entityId: row.id,
      diff: { bookingId: booking.id, driverId: assignment.driverId, rating: dto.rating },
    });

    return mapDriverReview(row);
  }

  private async listInternal(query: ListReviewsQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.DriverReviewWhereInput = {};
    if (query.driverId) where.driverId = query.driverId;
    if (query.bookingId) where.bookingId = query.bookingId;
    if (query.minRating) where.rating = { gte: query.minRating };

    const orderBy = parseSort(query.sort, ['createdAt', 'rating'], {
      field: 'createdAt',
      dir: 'desc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.driverReview.findMany({
        where,
        orderBy,
        skip,
        take,
        include: reviewInclude,
      }),
      this.prisma.driverReview.count({ where }),
    ]);

    return { data: rows.map(mapDriverReview), meta: pageMeta(total, page, limit) };
  }

  private async computeStats(driverId?: string): Promise<DriverReviewsStatsDto> {
    const where: Prisma.DriverReviewWhereInput = driverId ? { driverId } : {};
    const grouped = await this.prisma.driverReview.groupBy({
      by: ['rating'],
      where,
      _count: { _all: true },
    });

    const breakdown: DriverReviewsStatsDto['breakdown'] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let total = 0;
    let sum = 0;
    for (const row of grouped) {
      const stars = row.rating as 1 | 2 | 3 | 4 | 5;
      if (stars >= 1 && stars <= 5) {
        breakdown[stars] = row._count._all;
        total += row._count._all;
        sum += stars * row._count._all;
      }
    }

    return {
      driverId: driverId ?? null,
      average: total ? Number((sum / total).toFixed(1)) : 0,
      reviewsCount: total,
      breakdown,
    };
  }

  private async recalcDriverRating(
    tx: Prisma.TransactionClient,
    driverId: string,
  ) {
    const agg = await tx.driverReview.aggregate({
      where: { driverId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    const avg = agg._avg.rating ?? 0;
    await tx.driverProfile.update({
      where: { id: driverId },
      data: {
        rating: new Prisma.Decimal(count ? avg.toFixed(1) : '0.0'),
        reviewsCount: count,
      },
    });
  }

  private async requireDriverProfile(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw AppError.notFound('DRIVER_PROFILE_NOT_FOUND', 'Driver profile not found');
    }
    return profile;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !STAFF_READ_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
