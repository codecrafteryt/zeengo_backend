import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ConversationType,
  ParticipantType,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import { decimalToNumber } from '../common/decimal.util';
import {
  CreateBookingDto,
  CreateBookingNoteDto,
  CreateChecklistItemDto,
  ListBookingsQuery,
  UpdateBookingDto,
  UpdateChecklistItemDto,
} from './bookings.schema';
import {
  mapBooking,
  mapBookingCode,
  mapBookingNote,
  mapChecklistItem,
  mapPayment,
} from './bookings.mapper';
import { OPEN_ASSIGNMENT_STATUSES } from '../drivers/assignment.util';

const bookingInclude = {
  client: true,
  package: true,
  driverAssignments: {
    where: { status: { in: OPEN_ASSIGNMENT_STATUSES } },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      driver: {
        include: { user: true },
      },
    },
  },
} satisfies Prisma.BookingInclude;

const STAFF_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(dto: CreateBookingDto, staffId: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { id: dto.packageId, deletedAt: null, isActive: true },
    });
    if (!pkg) {
      throw AppError.notFound('PACKAGE_NOT_FOUND', 'Package not found');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      let client = await tx.client.findFirst({
        where: { phone: dto.client.phone, deletedAt: null },
      });

      if (!client) {
        client = await tx.client.create({
          data: {
            fullName: dto.client.fullName,
            phone: dto.client.phone,
            email: dto.client.email,
            nationality: dto.client.nationality,
          },
        });
      } else {
        client = await tx.client.update({
          where: { id: client.id },
          data: {
            fullName: dto.client.fullName,
            ...(dto.client.email !== undefined ? { email: dto.client.email } : {}),
            ...(dto.client.nationality !== undefined
              ? { nationality: dto.client.nationality }
              : {}),
          },
        });
      }

      const rows = await tx.$queryRaw<{ zn: string }[]>`
        SELECT 'ZN' || lpad(nextval('zn_seq')::text, 4, '0') AS zn
      `;
      const znCode = rows[0]?.zn;
      if (!znCode) {
        throw AppError.validation('Failed to generate booking code');
      }

      const created = await tx.booking.create({
        data: {
          znCode,
          clientId: client.id,
          packageId: dto.packageId,
          partySize: dto.partySize,
          arrivalDate: new Date(dto.arrivalDate),
          departureDate: new Date(dto.departureDate),
          totalAmount: dto.totalAmount,
          internalNotes: dto.internalNotes,
          createdBy: staffId,
        },
        include: bookingInclude,
      });

      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.booking_support,
          bookingId: created.id,
          title: `${znCode} Support — ${client.fullName}`,
        },
      });

      await tx.conversationParticipant.createMany({
        data: [
          {
            conversationId: conversation.id,
            participantType: ParticipantType.staff,
            participantKey: `staff:${staffId}`,
            staffId,
          },
          {
            conversationId: conversation.id,
            participantType: ParticipantType.client,
            participantKey: `client:${client.id}`,
            clientId: client.id,
          },
        ],
        skipDuplicates: true,
      });

      return created;
    });

    this.realtime.emit('booking.created', mapBooking(booking, 0));

    return mapBooking(booking, 0);
  }

  async list(query: ListBookingsQuery, user: AuthPrincipal) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where = this.buildListWhere(query, user);
    const orderBy = parseSort(query.sort, [
      'createdAt',
      'arrivalDate',
      'znCode',
      'status',
    ]);

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          client: true,
          ...(this.isCodesView(query, user)
            ? {}
            : {
                package: true,
                driverAssignments: {
                  where: { status: { in: OPEN_ASSIGNMENT_STATUSES } },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: {
                    driver: { include: { user: true } },
                  },
                },
              }),
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const paidMap = await this.getPaidAmounts(rows.map((r) => r.id));

    const data = this.isCodesView(query, user)
      ? rows.map((row) => mapBookingCode(row, paidMap.get(row.id) ?? 0))
      : await Promise.all(
          rows.map(async (row) => {
            const paid = paidMap.get(row.id) ?? 0;
            return mapBooking(row, paid);
          }),
        );

    return { data, meta: pageMeta(total, page, limit) };
  }

  async stats(user: AuthPrincipal) {
    this.assertStaffRead(user);

    const where = this.clientScopeWhere(user);
    const [total, active, completed, cancelled, revenueAgg] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.count({ where: { ...where, status: 'active' } }),
      this.prisma.booking.count({ where: { ...where, status: 'completed' } }),
      this.prisma.booking.count({ where: { ...where, status: 'cancelled' } }),
      this.prisma.booking.aggregate({
        where,
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      total,
      active,
      completed,
      cancelled,
      revenueTotal: decimalToNumber(revenueAgg._sum.totalAmount),
    };
  }

  async getById(id: string, user: AuthPrincipal) {
    const row = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });

    if (!row) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }

    this.assertBookingAccess(row.clientId, user);

    const paidAmount = await this.getPaidAmount(id);
    return mapBooking(row, paidAmount);
  }

  async update(id: string, dto: UpdateBookingDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    const existing = await this.prisma.booking.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }

    if (dto.packageId) {
      const pkg = await this.prisma.package.findFirst({
        where: { id: dto.packageId, deletedAt: null },
      });
      if (!pkg) {
        throw AppError.notFound('PACKAGE_NOT_FOUND', 'Package not found');
      }
    }

    const row = await this.prisma.booking.update({
      where: { id },
      data: {
        partySize: dto.partySize,
        arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : undefined,
        departureDate: dto.departureDate
          ? new Date(dto.departureDate)
          : undefined,
        packageId: dto.packageId,
        totalAmount: dto.totalAmount,
        status: dto.status,
        internalNotes: dto.internalNotes,
        isVip: dto.isVip,
      },
      include: bookingInclude,
    });

    const paidAmount = await this.getPaidAmount(id);
    return mapBooking(row, paidAmount);
  }

  async listChecklist(bookingId: string, user: AuthPrincipal) {
    await this.ensureBookingReadable(bookingId, user);

    const rows = await this.prisma.checklistItem.findMany({
      where: { bookingId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map(mapChecklistItem);
  }

  async createChecklistItem(
    bookingId: string,
    dto: CreateChecklistItemDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureBookingExists(bookingId);

    const maxSort = await this.prisma.checklistItem.aggregate({
      where: { bookingId },
      _max: { sortOrder: true },
    });

    const row = await this.prisma.checklistItem.create({
      data: {
        bookingId,
        title: dto.title,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
        createdBy: user.type === 'staff' ? user.sub : null,
      },
    });

    return mapChecklistItem(row);
  }

  async updateChecklistItem(
    bookingId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureChecklistItem(bookingId, itemId);

    const row = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        title: dto.title,
        isDone: dto.isDone,
        sortOrder: dto.sortOrder,
      },
    });

    return mapChecklistItem(row);
  }

  async deleteChecklistItem(
    bookingId: string,
    itemId: string,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureChecklistItem(bookingId, itemId);

    await this.prisma.checklistItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async listNotes(bookingId: string, user: AuthPrincipal) {
    this.assertStaffRead(user);
    await this.ensureBookingExists(bookingId);

    const rows = await this.prisma.bookingNote.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: { author: true },
    });

    return rows.map(mapBookingNote);
  }

  async createNote(
    bookingId: string,
    dto: CreateBookingNoteDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureBookingExists(bookingId);

    if (user.type !== 'staff') {
      throw AppError.forbidden();
    }

    const row = await this.prisma.bookingNote.create({
      data: {
        bookingId,
        authorId: user.sub,
        body: dto.body,
      },
      include: { author: true },
    });

    return mapBookingNote(row);
  }

  async listPayments(bookingId: string, user: AuthPrincipal) {
    await this.ensureBookingReadable(bookingId, user);

    const rows = await this.prisma.payment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapPayment);
  }

  async getPaidAmount(bookingId: string): Promise<number> {
    const cacheKey = `booking:${bookingId}:paid`;
    const cached = await this.redis.get(cacheKey);
    if (cached != null) {
      return Number(cached);
    }

    const agg = await this.prisma.payment.aggregate({
      where: { bookingId, status: 'paid' },
      _sum: { amount: true },
    });

    const paid = decimalToNumber(agg._sum.amount);
    await this.redis.set(cacheKey, String(paid), 60);
    return paid;
  }

  async invalidatePaidCache(bookingId: string): Promise<void> {
    await this.redis.del(`booking:${bookingId}:paid`);
  }

  private async getPaidAmounts(bookingIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (bookingIds.length === 0) return map;

    await Promise.all(
      bookingIds.map(async (id) => {
        map.set(id, await this.getPaidAmount(id));
      }),
    );

    return map;
  }

  private buildListWhere(
    query: ListBookingsQuery,
    user: AuthPrincipal,
  ): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = {
      ...this.clientScopeWhere(user),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { znCode: { contains: term, mode: 'insensitive' } },
        { client: { fullName: { contains: term, mode: 'insensitive' } } },
        { client: { phone: { contains: term } } },
      ];
    }

    return where;
  }

  private clientScopeWhere(user: AuthPrincipal): Prisma.BookingWhereInput {
    if (user.type === 'client') {
      return { clientId: user.sub };
    }
    return {};
  }

  private isCodesView(query: ListBookingsQuery, user: AuthPrincipal): boolean {
    if (query.view === 'codes') return true;
    return user.type === 'staff' && user.role === StaffRole.splizer;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (user.type === 'client') {
      throw AppError.forbidden();
    }
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !STAFF_WRITE_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }

  private assertBookingAccess(clientId: string, user: AuthPrincipal) {
    if (user.type === 'client' && clientId !== user.sub) {
      throw AppError.forbidden();
    }
  }

  private async ensureBookingExists(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private async ensureBookingReadable(bookingId: string, user: AuthPrincipal) {
    const booking = await this.ensureBookingExists(bookingId);
    this.assertBookingAccess(booking.clientId, user);
    return booking;
  }

  private async ensureChecklistItem(bookingId: string, itemId: string) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, bookingId },
    });
    if (!item) {
      throw AppError.notFound('CHECKLIST_ITEM_NOT_FOUND', 'Checklist item not found');
    }
    return item;
  }
}
