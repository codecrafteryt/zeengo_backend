import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  EditRequestStatus,
  EditRequestType,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import { decimalToNumber } from '../common/decimal.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateEditRequestDto,
  ListEditRequestsQuery,
  ReviewEditRequestDto,
} from './edit-requests.schema';
import { mapEditRequest } from './edit-requests.mapper';

const REVIEW_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const STAFF_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
];

const editRequestInclude = {
  booking: true,
  reviewedByUser: true,
} satisfies Prisma.EditRequestInclude;

@Injectable()
export class EditRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListEditRequestsQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.EditRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.bookingId) where.bookingId = query.bookingId;

    const orderBy = parseSort(query.sort, ['createdAt', 'status', 'type'], {
      field: 'createdAt',
      dir: 'desc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.editRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        include: editRequestInclude,
      }),
      this.prisma.editRequest.count({ where }),
    ]);

    return { data: rows.map(mapEditRequest), meta: pageMeta(total, page, limit) };
  }

  async listByBooking(bookingId: string, user: AuthPrincipal) {
    const booking = await this.ensureBooking(bookingId);
    this.assertBookingAccess(booking.clientId, user);

    const rows = await this.prisma.editRequest.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: editRequestInclude,
    });

    return rows.map(mapEditRequest);
  }

  async getById(id: string, user: AuthPrincipal) {
    const row = await this.ensureEditRequest(id);
    this.assertBookingAccess(row.booking.clientId, user);
    return mapEditRequest(row);
  }

  /** Client creates edit request against their active booking. */
  async create(dto: CreateEditRequestDto, user: AuthPrincipal) {
    if (user.type !== 'client') {
      throw AppError.forbidden();
    }

    const booking = await this.findActiveBookingForClient(user.sub);
    const originalValue = dto.originalValue ?? this.defaultOriginalValue(booking, dto.type);

    const row = await this.prisma.editRequest.create({
      data: {
        bookingId: booking.id,
        type: dto.type,
        originalValue,
        requestedValue: dto.requestedValue,
        reason: dto.reason,
      },
      include: editRequestInclude,
    });

    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'edit_request',
      title: `Edit request: ${dto.type}`,
      body: `Booking ${booking.znCode} — ${dto.reason ?? 'No reason provided'}`,
      data: { editRequestId: row.id, bookingId: booking.id, type: dto.type },
    });

    return mapEditRequest(row);
  }

  async approve(id: string, dto: ReviewEditRequestDto, user: AuthPrincipal) {
    this.assertReviewer(user);
    const existing = await this.ensureEditRequest(id);

    if (existing.status !== EditRequestStatus.pending) {
      throw AppError.conflict('EDIT_REQUEST_NOT_PENDING', 'Edit request is not pending');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.type === EditRequestType.date_change) {
        await this.applyDateChange(tx, existing);
      } else if (existing.type === EditRequestType.vip_upgrade) {
        await this.applyVipUpgrade(tx, existing.bookingId, user.sub);
      }

      return tx.editRequest.update({
        where: { id },
        data: {
          status: EditRequestStatus.approved,
          reviewNotes: dto.reviewNotes,
          reviewedBy: user.sub,
          reviewedAt: new Date(),
        },
        include: editRequestInclude,
      });
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'edit_request.approve',
      entity: 'edit_request',
      entityId: id,
      diff: { type: existing.type, reviewNotes: dto.reviewNotes },
    });

    if (existing.booking.clientId) {
      await this.notifications.createAndFanout({
        recipientType: 'client',
        clientId: existing.booking.clientId,
        type: 'edit_request',
        title: 'Edit request approved',
        body: `Your ${existing.type.replace('_', ' ')} request was approved.`,
        data: { editRequestId: id, bookingId: existing.bookingId },
      });
    }

    return mapEditRequest(row);
  }

  async reject(id: string, dto: ReviewEditRequestDto, user: AuthPrincipal) {
    this.assertReviewer(user);
    const existing = await this.ensureEditRequest(id);

    if (existing.status !== EditRequestStatus.pending) {
      throw AppError.conflict('EDIT_REQUEST_NOT_PENDING', 'Edit request is not pending');
    }

    const row = await this.prisma.editRequest.update({
      where: { id },
      data: {
        status: EditRequestStatus.rejected,
        reviewNotes: dto.reviewNotes,
        reviewedBy: user.sub,
        reviewedAt: new Date(),
      },
      include: editRequestInclude,
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'edit_request.reject',
      entity: 'edit_request',
      entityId: id,
      diff: { reviewNotes: dto.reviewNotes },
    });

    if (existing.booking.clientId) {
      await this.notifications.createAndFanout({
        recipientType: 'client',
        clientId: existing.booking.clientId,
        type: 'edit_request',
        title: 'Edit request rejected',
        body: dto.reviewNotes ?? 'Your edit request was rejected.',
        data: { editRequestId: id, bookingId: existing.bookingId },
      });
    }

    return mapEditRequest(row);
  }

  async createForBooking(
    bookingId: string,
    dto: CreateEditRequestDto,
    user: AuthPrincipal,
  ) {
    if (user.type !== 'client') {
      throw AppError.forbidden();
    }

    const booking = await this.ensureBooking(bookingId);
    if (booking.clientId !== user.sub) {
      throw AppError.forbidden();
    }
    if (booking.status !== BookingStatus.active) {
      throw AppError.validation('Booking is not active');
    }

    const originalValue = dto.originalValue ?? this.defaultOriginalValue(booking, dto.type);

    const row = await this.prisma.editRequest.create({
      data: {
        bookingId,
        type: dto.type,
        originalValue,
        requestedValue: dto.requestedValue,
        reason: dto.reason,
      },
      include: editRequestInclude,
    });

    return mapEditRequest(row);
  }

  private async applyDateChange(
    tx: Prisma.TransactionClient,
    request: Prisma.EditRequestGetPayload<{ include: { booking: true } }>,
  ) {
    if (!request.requestedValue) return;

    let parsed: { arrivalDate?: string; departureDate?: string };
    try {
      parsed = JSON.parse(request.requestedValue) as {
        arrivalDate?: string;
        departureDate?: string;
      };
    } catch {
      throw AppError.validation('Invalid date_change requestedValue JSON');
    }

    const data: Prisma.BookingUpdateInput = {};
    if (parsed.arrivalDate) data.arrivalDate = new Date(parsed.arrivalDate);
    if (parsed.departureDate) data.departureDate = new Date(parsed.departureDate);

    if (Object.keys(data).length === 0) return;

    await tx.booking.update({
      where: { id: request.bookingId },
      data,
    });
  }

  private async applyVipUpgrade(
    tx: Prisma.TransactionClient,
    bookingId: string,
    staffId: string,
  ) {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (booking.isVip) return;

    const vipPrice = await this.getVipPrice();
    const newTotal = decimalToNumber(booking.totalAmount) + vipPrice;

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        isVip: true,
        vipActivatedAt: new Date(),
        vipActivatedBy: staffId,
        totalAmount: newTotal,
      },
    });
  }

  async getVipPrice(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'vip_price' },
    });
    if (setting?.value != null) {
      const v = setting.value;
      if (typeof v === 'number') return v;
      if (typeof v === 'object' && v !== null && 'amount' in v) {
        const amount = (v as { amount: unknown }).amount;
        if (typeof amount === 'number') return amount;
      }
    }
    return this.config.get<number>('VIP_PRICE_USD', 100);
  }

  private defaultOriginalValue(
    booking: { arrivalDate: Date | null; departureDate: Date | null; isVip: boolean },
    type: EditRequestType,
  ): string | undefined {
    if (type === EditRequestType.date_change) {
      return JSON.stringify({
        arrivalDate: booking.arrivalDate?.toISOString().slice(0, 10) ?? null,
        departureDate: booking.departureDate?.toISOString().slice(0, 10) ?? null,
      });
    }
    if (type === EditRequestType.vip_upgrade) {
      return JSON.stringify({ isVip: booking.isVip });
    }
    return undefined;
  }

  private async findActiveBookingForClient(clientId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { clientId, status: BookingStatus.active },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) {
      throw AppError.notFound('ACTIVE_BOOKING_NOT_FOUND', 'No active booking found');
    }
    return booking;
  }

  private async ensureEditRequest(id: string) {
    const row = await this.prisma.editRequest.findUnique({
      where: { id },
      include: editRequestInclude,
    });
    if (!row) {
      throw AppError.notFound('EDIT_REQUEST_NOT_FOUND', 'Edit request not found');
    }
    return row;
  }

  private async ensureBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (
      user.type !== 'staff' ||
      !user.role ||
      !STAFF_READ_ROLES.includes(user.role)
    ) {
      throw AppError.forbidden();
    }
  }

  private assertReviewer(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !REVIEW_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }

  private assertBookingAccess(clientId: string, user: AuthPrincipal) {
    if (user.type === 'client' && clientId !== user.sub) {
      throw AppError.forbidden();
    }
    if (user.type === 'staff' && user.role && !STAFF_READ_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
