import { Injectable } from '@nestjs/common';
import {
  BookingRequestStatus,
  BookingSource,
  BookingStatus,
  ConversationType,
  NotificationType,
  ParticipantType,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { clientMayAccessBooking } from '../auth/client-auth.policy';
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
  CreateCustomerBookingRequestDto,
  ListBookingsQuery,
  ReviewCustomerBookingDto,
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
import { assertDriverAssignedToBooking } from '../common/booking-access.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  IndicativePrice,
  nightsBetween,
  transferPrice,
  unitPrice,
} from '../client-v2/indicative-price';

type CustomerRequestItem =
  CreateCustomerBookingRequestDto['requestedItems'][number];

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
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
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
          source: BookingSource.staff,
          requestStatus: BookingRequestStatus.confirmed,
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

    await this.audit.log({
      actorType: 'staff',
      actorId: staffId,
      action: 'booking.create',
      entity: 'booking',
      entityId: booking.id,
      diff: { znCode: booking.znCode, clientId: booking.clientId },
    });

    return mapBooking(booking, 0);
  }

  /**
   * Option A — customer creates a real Booking + ZN immediately.
   * requestStatus=pending until staff confirms/rejects.
   */
  async createCustomerRequest(
    dto: CreateCustomerBookingRequestDto,
    user: AuthPrincipal | null,
  ) {
    const existingKey = await this.prisma.booking.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: bookingInclude,
    });
    if (existingKey) {
      if (user?.type === 'client' && existingKey.clientId !== user.sub) {
        throw AppError.conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'This request key was already used',
        );
      }
      const paid = await this.getPaidAmount(existingKey.id);
      return mapBooking(existingKey, paid);
    }

    if (user?.type === 'client') {
      const owned = await this.prisma.client.findFirst({
        where: { id: user.sub, deletedAt: null },
      });
      if (!owned) throw AppError.forbidden();
      if (owned.phone !== dto.client.phone) {
        // Allow updating contact on the authenticated client record only via same phone match.
        // Different phone = reject to prevent hijacking another client identity.
        throw AppError.validation(
          'Phone must match your signed-in account',
        );
      }
    }

    let packageId = dto.packageId;
    if (packageId) {
      const pkg = await this.prisma.package.findFirst({
        where: { id: packageId, deletedAt: null, isActive: true },
      });
      if (!pkg) {
        throw AppError.notFound('PACKAGE_NOT_FOUND', 'Package not found');
      }
    } else {
      const fallback = await this.prisma.package.findFirst({
        where: { deletedAt: null, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!fallback) {
        throw AppError.validation(
          'No active travel package is configured — contact ZEEN desk',
        );
      }
      packageId = fallback.id;
    }

    const resolvedItems: Awaited<ReturnType<BookingsService['resolveRequestedItem']>>[] = [];
    for (const item of dto.requestedItems ?? []) {
      resolvedItems.push(await this.resolveRequestedItem(item, dto.partySize));
    }

    const source =
      dto.source === 'customer_app'
        ? BookingSource.customer_app
        : BookingSource.customer_web;

    const booking = await this.prisma.$transaction(async (tx) => {
      let client = await tx.client.findFirst({
        where: { phone: dto.client.phone, deletedAt: null },
      });

      if (user?.type === 'client') {
        client = await tx.client.update({
          where: { id: user.sub },
          data: {
            fullName: dto.client.fullName,
            ...(dto.client.email !== undefined ? { email: dto.client.email } : {}),
            ...(dto.client.nationality !== undefined
              ? { nationality: dto.client.nationality }
              : {}),
          },
        });
      } else if (!client) {
        client = await tx.client.create({
          data: {
            fullName: dto.client.fullName,
            phone: dto.client.phone,
            email: dto.client.email,
            nationality: dto.client.nationality,
          },
        });
      }
      // An anonymous caller only proves knowledge of a phone number, so an
      // existing client's profile is never modified from this path.

      const rows = await tx.$queryRaw<{ zn: string }[]>`
        SELECT 'ZN' || lpad(nextval('zn_seq')::text, 4, '0') AS zn
      `;
      const znCode = rows[0]?.zn;
      if (!znCode) {
        throw AppError.validation('Failed to generate booking code');
      }

      const notesParts = [
        dto.customerNotes?.trim(),
        dto.context?.from ? `From: ${dto.context.from}` : null,
        dto.context?.to ? `To: ${dto.context.to}` : null,
        dto.context?.dateLabel ? `When: ${dto.context.dateLabel}` : null,
      ].filter(Boolean);

      const created = await tx.booking.create({
        data: {
          znCode,
          clientId: client.id,
          packageId: packageId!,
          partySize: dto.partySize,
          childrenCount: dto.childrenCount ?? 0,
          arrivalDate: new Date(dto.arrivalDate),
          departureDate: new Date(dto.departureDate),
          totalAmount: 0,
          customerNotes: notesParts.join('\n') || null,
          createdBy: null,
          source,
          requestStatus: BookingRequestStatus.pending,
          idempotencyKey: dto.idempotencyKey,
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
            participantType: ParticipantType.client,
            participantKey: `client:${client.id}`,
            clientId: client.id,
          },
        ],
        skipDuplicates: true,
      });

      const systemStaff =
        (await tx.staffUser.findFirst({
          where: { role: StaffRole.support, deletedAt: null, isActive: true },
          select: { id: true },
        })) ??
        (await tx.staffUser.findFirst({
          where: { role: StaffRole.admin, deletedAt: null, isActive: true },
          select: { id: true },
        }));

      let day = 1;
      for (const { item, vendorId, description, extras } of resolvedItems) {
        const serviceDate = new Date(
          item.serviceDate ?? item.checkIn ?? dto.arrivalDate,
        );
        const itinerary = await tx.itineraryItem.create({
          data: {
            bookingId: created.id,
            dayNumber: day,
            itemDate: serviceDate,
            title: item.title,
            description,
            vendorId,
            status: 'pending',
            sortOrder: day - 1,
            notes: `Customer request · ${item.kind}`,
            extras,
          },
        });

        if (vendorId && systemStaff) {
          await tx.vendorBooking.create({
            data: {
              bookingId: created.id,
              vendorId,
              itineraryItemId: itinerary.id,
              serviceDate,
              pax: item.pax ?? dto.partySize,
              details: description ?? item.title,
              status: 'pending',
              createdBy: systemStaff.id,
            },
          });
        }
        day += 1;
      }

      return created;
    });

    this.realtime.emit('booking.created', mapBooking(booking, 0));

    await this.audit.log({
      actorType: user?.type === 'client' ? 'client' : 'system',
      actorId: user?.type === 'client' ? user.sub : undefined,
      action: 'booking.customer_request_created',
      entity: 'booking',
      entityId: booking.id,
      diff: {
        znCode: booking.znCode,
        source,
        requestStatus: BookingRequestStatus.pending,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: NotificationType.booking_request,
      title: 'New customer booking request',
      body: `${booking.znCode} · ${booking.client.fullName} · pending review`,
      data: {
        bookingId: booking.id,
        znCode: booking.znCode,
        requestStatus: BookingRequestStatus.pending,
        source,
      },
    });

    await this.notifications.createAndFanout({
      clientId: booking.clientId,
      type: NotificationType.booking_request,
      title: 'Booking request received',
      body: `We received your request ${booking.znCode}. ZEEN is reviewing it.`,
      data: {
        bookingId: booking.id,
        znCode: booking.znCode,
        requestStatus: BookingRequestStatus.pending,
      },
    });

    return mapBooking(booking, 0);
  }

  /**
   * Validates catalog references on a customer request item and computes its
   * indicative price from the rate card. The price is stored for OPS on the
   * itinerary item only; the booking total stays 0 until ZEEN sets it.
   */
  private async resolveRequestedItem(
    item: CustomerRequestItem,
    partySize: number,
  ) {
    const pax = item.pax ?? partySize;
    const notFound = () =>
      AppError.notFound('CATALOG_ITEM_NOT_FOUND', `Catalog item not found: ${item.title}`);
    let vendorId: string | null = null;
    let indicative: IndicativePrice | null = null;
    const ref: Record<string, unknown> = {};
    const lines: string[] = [];

    if (item.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: item.vendorId, deletedAt: null, isActive: true },
      });
      if (!vendor) throw notFound();
      vendorId = vendor.id;
      const nights =
        item.checkIn && item.checkOut ? nightsBetween(item.checkIn, item.checkOut) : undefined;
      let rate: Prisma.Decimal | null = vendor.priceFrom;
      let currency = vendor.priceCurrency;
      if (item.roomId) {
        const room = await this.prisma.hotelRoom.findFirst({
          where: { id: item.roomId, vendorId: vendor.id, isActive: true },
        });
        if (!room) throw notFound();
        ref.roomId = room.id;
        ref.roomName = room.name;
        lines.push(`Room: ${room.name}`);
        if (room.rate) {
          rate = room.rate;
          currency = room.rateCurrency;
        }
      }
      if (item.checkIn) lines.push(`Check-in ${item.checkIn}`);
      if (item.checkOut) lines.push(`Check-out ${item.checkOut}`);
      if (item.rooms && item.rooms > 1) lines.push(`${item.rooms} rooms`);
      indicative = unitPrice(rate, currency, vendor.priceUnit, {
        nights,
        rooms: item.rooms,
        pax,
      });
    }

    if (item.vehicleClassId) {
      const vc = await this.prisma.vehicleClass.findFirst({
        where: { id: item.vehicleClassId, isActive: true },
      });
      if (!vc) throw notFound();
      if (pax > vc.maxPax) {
        throw AppError.validation(`${vc.nameEn} seats up to ${vc.maxPax} people`);
      }
      const service = item.transferService ?? 'airport';
      ref.vehicleClassKey = vc.key;
      ref.transferService = service;
      lines.push(`${vc.nameEn} (${vc.models ?? 'or similar'})`);
      if (service === 'hourly') lines.push(`${item.hours ?? 1} h with driver`);
      if (service === 'day') lines.push('Full day with driver');
      indicative = transferPrice(vc, service, item.hours ?? 1);
    }

    if (item.trainRouteId) {
      const route = await this.prisma.trainRoute.findFirst({
        where: { id: item.trainRouteId, isActive: true },
      });
      if (!route) throw notFound();
      const classes = Array.isArray(route.classes) ? route.classes : [];
      if (item.trainClass && !classes.includes(item.trainClass)) {
        throw AppError.validation(`Unknown class for ${route.nameEn}`);
      }
      ref.trainRouteKey = route.key;
      lines.push(`${route.fromStation} → ${route.toStation}`);
      if (item.trainClass) lines.push(`Class: ${item.trainClass}`);
      indicative = unitPrice(route.rateFrom, route.rateCurrency, 'person', { pax });
    }

    if (item.from) lines.push(`From: ${item.from}`);
    if (item.to) lines.push(`To: ${item.to}`);
    if (item.time) lines.push(`Time: ${item.time}`);
    if (item.pax) lines.push(`${item.pax} guest${item.pax > 1 ? 's' : ''}`);
    if (item.detail?.trim()) lines.push(item.detail.trim());

    return {
      item,
      vendorId,
      description: lines.join(' · ') || null,
      extras: {
        requestedKind: item.kind,
        quantity: item.quantity ?? 1,
        source: 'customer_request',
        ...ref,
        ...(item.checkIn ? { checkIn: item.checkIn } : {}),
        ...(item.checkOut ? { checkOut: item.checkOut } : {}),
        ...(item.rooms ? { rooms: item.rooms } : {}),
        ...(item.hours ? { hours: item.hours } : {}),
        ...(item.trainClass ? { trainClass: item.trainClass } : {}),
        ...(item.time ? { time: item.time } : {}),
        pax,
        indicativePrice: indicative,
      } as Prisma.InputJsonObject,
    };
  }

  async reviewCustomerRequest(
    id: string,
    dto: ReviewCustomerBookingDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);

    const existing = await this.prisma.booking.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!existing) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }

    if (
      existing.source !== BookingSource.customer_web &&
      existing.source !== BookingSource.customer_app
    ) {
      throw AppError.validation(
        'Only customer-originated bookings use request review',
      );
    }

    if (dto.requestStatus === 'rejected' && !dto.rejectionReason?.trim()) {
      throw AppError.validation('rejectionReason is required when rejecting');
    }

    const row = await this.prisma.booking.update({
      where: { id },
      data: {
        requestStatus: dto.requestStatus as BookingRequestStatus,
        rejectionReason:
          dto.requestStatus === 'rejected'
            ? dto.rejectionReason!.trim()
            : null,
        ...(dto.reviewNotes
          ? {
              internalNotes: [existing.internalNotes, dto.reviewNotes.trim()]
                .filter(Boolean)
                .join('\n'),
            }
          : {}),
      },
      include: bookingInclude,
    });

    const paidAmount = await this.getPaidAmount(id);
    const mapped = mapBooking(row, paidAmount);
    this.realtime.emit('booking.updated', mapped);

    const action =
      dto.requestStatus === 'confirmed'
        ? 'booking.customer_request_confirmed'
        : dto.requestStatus === 'rejected'
          ? 'booking.customer_request_rejected'
          : 'booking.customer_request_reviewed';

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action,
      entity: 'booking',
      entityId: id,
      diff: {
        requestStatus: dto.requestStatus,
        rejectionReason: dto.rejectionReason,
      },
    });

    if (dto.requestStatus === 'confirmed') {
      await this.notifications.createAndFanout({
        clientId: row.clientId,
        type: NotificationType.booking_request,
        title: 'Your booking has been confirmed',
        body: `${row.znCode} is confirmed. Open My Trip for details.`,
        data: {
          bookingId: row.id,
          znCode: row.znCode,
          requestStatus: BookingRequestStatus.confirmed,
        },
      });
    } else if (dto.requestStatus === 'rejected') {
      await this.notifications.createAndFanout({
        clientId: row.clientId,
        type: NotificationType.booking_request,
        title: 'Your booking request has been rejected',
        body:
          dto.rejectionReason?.trim() ||
          `${row.znCode} could not be confirmed. Contact ZEEN desk.`,
        data: {
          bookingId: row.id,
          znCode: row.znCode,
          requestStatus: BookingRequestStatus.rejected,
        },
      });
    }

    return mapped;
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

    this.assertBookingAccess(row, user);

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
    const mapped = mapBooking(row, paidAmount);
    this.realtime.emit('booking.updated', mapped);
    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'booking.update',
      entity: 'booking',
      entityId: id,
      diff: {
        znCode: row.znCode,
        status: dto.status,
        partySize: dto.partySize,
        packageId: dto.packageId,
        arrivalDate: dto.arrivalDate,
        departureDate: dto.departureDate,
        isVip: dto.isVip,
      },
    });
    return mapped;
  }

  async listVendorBookings(bookingId: string, user: AuthPrincipal) {
    await this.ensureBookingReadable(bookingId, user);

    const rows = await this.prisma.vendorBooking.findMany({
      where: { bookingId },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        vendor: true,
        booking: { include: { client: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      vendorId: row.vendorId,
      vendorName: row.vendor.name,
      vendorType: row.vendor.type,
      vendorCity: row.vendor.city,
      bookingId: row.bookingId,
      znCode: row.booking.znCode,
      clientName: row.booking.client.fullName,
      itineraryItemId: row.itineraryItemId,
      amount: row.amount != null ? decimalToNumber(row.amount) : null,
      commissionAmount:
        row.commissionAmount != null
          ? decimalToNumber(row.commissionAmount)
          : null,
      serviceDate: row.serviceDate?.toISOString().slice(0, 10) ?? null,
      pax: row.pax,
      details: row.details,
      voucherCode: row.voucherCode,
      voucherSentAt: row.voucherSentAt?.toISOString() ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
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

  async listHistory(bookingId: string, user: AuthPrincipal) {
    await this.ensureBookingReadable(bookingId, user);

    const related = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        payments: { select: { id: true } },
        sosAlerts: { select: { id: true } },
        editRequests: { select: { id: true } },
        vendorBookings: { select: { id: true } },
        documents: { select: { id: true } },
        itineraryItems: { select: { id: true } },
        driverAssignments: { select: { id: true } },
        tasks: { select: { id: true } },
      },
    });

    const relatedIds = [
      bookingId,
      ...(related?.payments.map((row) => row.id) ?? []),
      ...(related?.sosAlerts.map((row) => row.id) ?? []),
      ...(related?.editRequests.map((row) => row.id) ?? []),
      ...(related?.vendorBookings.map((row) => row.id) ?? []),
      ...(related?.documents.map((row) => row.id) ?? []),
      ...(related?.itineraryItems.map((row) => row.id) ?? []),
      ...(related?.driverAssignments.map((row) => row.id) ?? []),
      ...(related?.tasks.map((row) => row.id) ?? []),
    ];

    const rows = await this.prisma.auditLog.findMany({
      where: { entityId: { in: relatedIds } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    return rows.map((row) => ({
      id: String(row.id),
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      summary: this.auditSummary(row.action),
    }));
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

    if (query.requestStatus) {
      where.requestStatus = query.requestStatus;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.customerRequests) {
      where.source = {
        in: [BookingSource.customer_web, BookingSource.customer_app],
      };
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
      return {
        clientId: user.sub,
        ...(user.bookingId ? { id: user.bookingId } : {}),
      };
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

  private auditSummary(action: string) {
    const labels: Record<string, string> = {
      'booking.created': 'Booking created',
      'booking.updated': 'Booking updated',
      'booking.customer_request_created': 'Customer request submitted',
      'booking.customer_request_reviewed': 'Customer request reviewed',
      'booking.customer_request_confirmed': 'Customer request confirmed',
      'booking.customer_request_rejected': 'Customer request rejected',
      'auth.client_zn_login': 'Client signed in with ZN',
      'payment.record_cash': 'Cash payment recorded',
      'payment.create_stripe_link': 'Stripe link created',
      'payment.stripe_webhook': 'Stripe payment updated',
      'sos.create': 'SOS opened',
      'sos.resolve': 'SOS resolved',
      'edit_request.approve': 'Edit request approved',
      'edit_request.reject': 'Edit request rejected',
      'itinerary.create': 'Itinerary item added',
      'itinerary.update': 'Itinerary item updated',
      'itinerary.delete': 'Itinerary item removed',
      'assignment.create': 'Driver assigned',
      'task.create': 'Task created',
      'document.upload': 'Document uploaded',
      'document.delete': 'Document deleted',
    };
    return labels[action] ?? action.replace(/[._]/g, ' ');
  }

  private assertBookingAccess(
    booking: { id: string; clientId: string },
    user: AuthPrincipal,
  ) {
    if (!clientMayAccessBooking(booking, user)) {
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
    this.assertBookingAccess(booking, user);
    await assertDriverAssignedToBooking({
      user,
      bookingId,
      driverAssignments: this.prisma.driverAssignment,
    });
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
