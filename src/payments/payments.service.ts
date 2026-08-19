import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { decimalToNumber } from '../common/decimal.util';
import { AuditService } from '../common/audit.service';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import { BookingsService } from '../bookings/bookings.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  CreateStripeLinkDto,
  ListPaymentsHistoryQuery,
  ListPaymentsQuery,
  ListSplizerClientsQuery,
  RecordCashPaymentDto,
} from './payments.schema';
import {
  mapPayment,
  mapPaymentHistoryItem,
  mapSplizerClient,
} from './payments.mapper';

const paymentInclude = {
  collectedByUser: true,
} satisfies Prisma.PaymentInclude;

const historyInclude = {
  collectedByUser: true,
  booking: {
    include: { client: true },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    private readonly realtime: RealtimeEmitter,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY', '').trim();
    if (key.startsWith('sk_') && !key.includes('replace')) {
      this.stripe = new Stripe(key);
    }
  }

  async recordCashPayment(dto: RecordCashPaymentDto, staffId: string) {
    const booking = await this.resolveBookingRef(dto);
    const due = await this.getDueAmount(booking.id);
    if (due <= 0) {
      throw new AppError('NOTHING_DUE', 'This booking is already fully paid');
    }
    if (dto.amount - due > 0.009) {
      throw new AppError(
        'AMOUNT_EXCEEDS_DUE',
        `Amount cannot exceed remaining due (${due})`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: dto.amount,
        method: dto.method as PaymentMethod,
        status: PaymentStatus.paid,
        location: dto.location,
        notes: dto.notes,
        collectedBy: staffId,
        paidAt: new Date(),
      },
      include: paymentInclude,
    });

    await this.bookings.invalidatePaidCache(booking.id);

    await this.audit.log({
      actorType: 'staff',
      actorId: staffId,
      action: 'payment.record_cash',
      entity: 'payment',
      entityId: payment.id,
      diff: {
        bookingId: booking.id,
        znCode: booking.znCode,
        amount: dto.amount,
        method: dto.method,
      },
    });

    this.realtime.emit('payment.recorded', mapPayment(payment));

    return mapPayment(payment);
  }

  async createStripeLink(dto: CreateStripeLinkDto, staffId: string) {
    const booking = await this.resolveBookingRef(dto);
    const amount = await this.resolveStripeAmount(booking.id, dto);
    const defaultExpiry = this.config.get<number>(
      'STRIPE_LINK_DEFAULT_EXPIRY_HOURS',
      48,
    );
    const expiresInHours = dto.expiresInHours ?? defaultExpiry;
    const linkExpiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount,
        method: PaymentMethod.stripe,
        status: PaymentStatus.sent,
        collectedBy: staffId,
        linkExpiresAt,
      },
    });

    let stripePaymentLinkId: string | null = null;
    let stripeLinkUrl: string;

    if (this.stripe) {
      const link = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Zeengo booking ${booking.znCode}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          paymentId: payment.id,
          bookingId: booking.id,
          znCode: booking.znCode,
        },
      });

      stripePaymentLinkId = link.id;
      stripeLinkUrl = link.url;
    } else {
      stripeLinkUrl = `https://pay.zeengo.local/dev/${payment.id}`;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripePaymentLinkId,
        stripeLinkUrl,
      },
      include: paymentInclude,
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: staffId,
      action: 'payment.create_stripe_link',
      entity: 'payment',
      entityId: payment.id,
      diff: {
        bookingId: booking.id,
        amount,
        stripeLinkUrl,
        linkExpiresAt: linkExpiresAt.toISOString(),
      },
    });

    this.realtime.emit('payment.recorded', mapPayment(updated));

    return mapPayment(updated);
  }

  async listHistory(query: ListPaymentsHistoryQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where = this.buildHistoryWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: historyInclude,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: rows.map(mapPaymentHistoryItem),
      meta: pageMeta(total, page, limit),
    };
  }

  async list(query: ListPaymentsQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { notes: { contains: term, mode: 'insensitive' } },
        { booking: { znCode: { contains: term, mode: 'insensitive' } } },
        {
          booking: {
            client: { fullName: { contains: term, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: paymentInclude,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: rows.map(mapPayment),
      meta: pageMeta(total, page, limit),
    };
  }

  async getReceipt(id: string) {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      include: historyInclude,
    });
    if (!row) {
      throw AppError.notFound('PAYMENT_NOT_FOUND', 'Payment not found');
    }
    return mapPaymentHistoryItem(row);
  }

  async listSplizerClients(query: ListSplizerClientsQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.BookingWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { znCode: { contains: term, mode: 'insensitive' } },
        { client: { fullName: { contains: term, mode: 'insensitive' } } },
        { client: { phone: { contains: term } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { arrivalDate: 'asc' },
        skip,
        take,
        include: { client: true, package: true },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const paidMap = await this.getPaidAmounts(rows.map((r) => r.id));

    return {
      data: rows.map((row) =>
        mapSplizerClient({ ...row, paidAmount: paidMap.get(row.id) ?? 0 }),
      ),
      meta: pageMeta(total, page, limit),
    };
  }

  async getSplizerClientByCode(znCode: string) {
    const code = znCode.trim();
    const booking = await this.prisma.booking.findFirst({
      where: { znCode: { equals: code, mode: 'insensitive' } },
      include: { client: true, package: true },
    });

    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }

    const paidAmount = await this.bookings.getPaidAmount(booking.id);
    return mapSplizerClient({ ...booking, paidAmount });
  }

  async applyStripeWebhookStatus(params: {
    paymentId: string;
    status: PaymentStatus;
    stripeSessionId?: string | null;
    paidAt?: Date;
  }) {
    const existing = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
    });

    if (!existing) {
      throw AppError.notFound('PAYMENT_NOT_FOUND', 'Payment not found');
    }

    if (
      existing.status === PaymentStatus.paid &&
      params.status !== PaymentStatus.paid
    ) {
      return mapPayment(
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: params.paymentId },
          include: paymentInclude,
        }),
      );
    }

    if (
      params.status === PaymentStatus.opened &&
      existing.status !== PaymentStatus.sent &&
      existing.status !== PaymentStatus.pending
    ) {
      return mapPayment(
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: params.paymentId },
          include: paymentInclude,
        }),
      );
    }

    const payment = await this.prisma.payment.update({
      where: { id: params.paymentId },
      data: {
        status: params.status,
        ...(params.stripeSessionId != null
          ? { stripeSessionId: params.stripeSessionId }
          : {}),
        ...(params.status === PaymentStatus.paid
          ? { paidAt: params.paidAt ?? new Date() }
          : {}),
      },
      include: paymentInclude,
    });

    if (params.status === PaymentStatus.paid) {
      await this.bookings.invalidatePaidCache(payment.bookingId);
    }

    await this.audit.log({
      actorType: 'webhook',
      action: 'payment.stripe_webhook',
      entity: 'payment',
      entityId: payment.id,
      diff: { status: params.status },
    });

    this.realtime.emit('payment.updated', mapPayment(payment));

    return mapPayment(payment);
  }

  async findPaymentForStripeSession(
    session: Stripe.Checkout.Session,
  ): Promise<string | null> {
    const metadataPaymentId = session.metadata?.paymentId;
    if (metadataPaymentId) return metadataPaymentId;

    const paymentLinkId =
      typeof session.payment_link === 'string' ?
        session.payment_link
      : session.payment_link?.id;
    if (paymentLinkId) {
      const byLink = await this.prisma.payment.findFirst({
        where: { stripePaymentLinkId: paymentLinkId },
        select: { id: true },
      });
      if (byLink) return byLink.id;
    }

    if (session.id) {
      const bySession = await this.prisma.payment.findFirst({
        where: { stripeSessionId: session.id },
        select: { id: true },
      });
      if (bySession) return bySession.id;
    }

    return null;
  }

  /** Marks sent/opened Stripe links past linkExpiresAt as expired. */
  async expireStaleLinks(): Promise<number> {
    const result = await this.prisma.payment.updateMany({
      where: {
        status: { in: [PaymentStatus.sent, PaymentStatus.opened] },
        linkExpiresAt: { lt: new Date() },
      },
      data: { status: PaymentStatus.expired },
    });
    return result.count;
  }

  async resolvePaymentIdFromStripeEvent(
    event: Stripe.Event,
  ): Promise<string | null> {
    const object = event.data.object;

    if (
      typeof object === 'object' &&
      object !== null &&
      'metadata' in object &&
      typeof object.metadata === 'object' &&
      object.metadata !== null
    ) {
      const paymentId = (object.metadata as Record<string, string>).paymentId;
      if (paymentId) return paymentId;
    }

    if (event.type.startsWith('checkout.session.')) {
      return this.findPaymentForStripeSession(object as Stripe.Checkout.Session);
    }

    if (
      typeof object === 'object' &&
      object !== null &&
      'payment_link' in object &&
      typeof object.payment_link === 'string'
    ) {
      const payment = await this.prisma.payment.findFirst({
        where: { stripePaymentLinkId: object.payment_link },
        select: { id: true },
      });
      if (payment) return payment.id;
    }

    return null;
  }

  private buildHistoryWhere(
    query: ListPaymentsHistoryQuery,
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { notes: { contains: term, mode: 'insensitive' } },
        { booking: { znCode: { contains: term, mode: 'insensitive' } } },
        {
          booking: {
            client: { fullName: { contains: term, mode: 'insensitive' } },
          },
        },
        {
          booking: {
            client: { phone: { contains: term } },
          },
        },
      ];
    }

    return where;
  }

  private async resolveBookingRef(ref: { bookingId?: string; znCode?: string }) {
    if (ref.bookingId) {
      return this.ensureBooking(ref.bookingId);
    }
    const code = ref.znCode?.trim();
    if (!code) {
      throw new AppError('BOOKING_REQUIRED', 'bookingId or znCode is required');
    }
    const booking = await this.prisma.booking.findFirst({
      where: { znCode: { equals: code, mode: 'insensitive' } },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private async getDueAmount(bookingId: string): Promise<number> {
    const booking = await this.ensureBooking(bookingId);
    const paid = await this.bookings.getPaidAmount(bookingId);
    return Math.max(
      0,
      Math.round((decimalToNumber(booking.totalAmount) - paid) * 100) / 100,
    );
  }

  private async resolveStripeAmount(
    bookingId: string,
    dto: CreateStripeLinkDto,
  ): Promise<number> {
    const due = await this.getDueAmount(bookingId);
    if (due <= 0) {
      throw new AppError('NOTHING_DUE', 'This booking is already fully paid');
    }

    const mode = dto.amountMode ?? 'remaining';
    let amount = dto.amount ?? due;

    if (mode === 'remaining') {
      amount = due;
    } else if (mode === 'deposit') {
      const booking = await this.ensureBooking(bookingId);
      const deposit = Math.round(decimalToNumber(booking.totalAmount) * 0.3 * 100) / 100;
      amount = Math.min(due, Math.max(1, deposit));
    } else if (dto.amount == null) {
      throw new AppError('AMOUNT_REQUIRED', 'Custom amount is required');
    }

    if (amount - due > 0.009) {
      throw new AppError(
        'AMOUNT_EXCEEDS_DUE',
        `Amount cannot exceed remaining due (${due})`,
      );
    }

    return Math.round(amount * 100) / 100;
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

  private async getPaidAmounts(
    bookingIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    await Promise.all(
      bookingIds.map(async (id) => {
        map.set(id, await this.bookings.getPaidAmount(id));
      }),
    );
    return map;
  }
}
