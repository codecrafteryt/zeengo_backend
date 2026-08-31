import { Injectable } from '@nestjs/common';
import { BookingStatus, NotificationType, Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { decimalToNumber } from '../common/decimal.util';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EmailTemplateKey,
  ListEmailsQuery,
  PreviewEmailDto,
  SendEmailDto,
} from './emails.schema';
import {
  EMAIL_TEMPLATE_META,
  mapEmailLog,
  templateName,
  type EmailPreviewDto,
  type EmailRecipientDto,
} from './emails.mapper';

const EMAIL_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const bookingDetailInclude = {
  client: true,
  package: true,
  itineraryItems: {
    orderBy: [{ dayNumber: 'asc' as const }, { sortOrder: 'asc' as const }],
    take: 20,
  },
  payments: { orderBy: { createdAt: 'desc' as const }, take: 8 },
  sosAlerts: { orderBy: { createdAt: 'desc' as const }, take: 3 },
} satisfies Prisma.BookingInclude;

type BookingDetail = Prisma.BookingGetPayload<{ include: typeof bookingDetailInclude }>;

@Injectable()
export class EmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  templates() {
    return EMAIL_TEMPLATE_META;
  }

  async recipients(user: AuthPrincipal): Promise<EmailRecipientDto[]> {
    this.assertStaff(user);
    const rows = await this.prisma.booking.findMany({
      where: { status: { in: [BookingStatus.active, BookingStatus.completed] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { client: true, package: true },
    });

    return rows.map((row) => ({
      bookingId: row.id,
      znCode: row.znCode,
      clientName: row.client.fullName,
      clientEmail: row.client.email,
      clientPhone: row.client.phone,
      packageName: row.package.name,
      arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
      departureDate: row.departureDate?.toISOString().slice(0, 10) ?? null,
      isVip: row.isVip,
      status: row.status,
    }));
  }

  async preview(dto: PreviewEmailDto, user: AuthPrincipal): Promise<EmailPreviewDto> {
    this.assertStaff(user);
    const booking = await this.loadBooking(dto.bookingId);
    return this.buildPreview(booking, dto.template);
  }

  async send(dto: SendEmailDto, user: AuthPrincipal) {
    this.assertStaff(user);
    const booking = await this.loadBooking(dto.bookingId);
    const preview = this.buildPreview(booking, dto.template);
    const to = (dto.to ?? preview.to ?? '').trim().toLowerCase();
    if (!to) {
      throw AppError.validation(
        'This guest has no email on file. Add one on the client record, or type an address.',
      );
    }

    const row = await this.prisma.emailLog.create({
      data: {
        bookingId: booking.id,
        toEmail: to,
        toName: preview.toName,
        template: dto.template,
        subject: preview.subject,
        body: preview.body,
        status: 'sent',
        sentBy: user.sub,
      },
      include: {
        booking: { select: { znCode: true } },
        sentByUser: { select: { fullName: true } },
      },
    });

    await this.notifications.createAndFanout({
      recipientType: 'client',
      clientId: booking.clientId,
      type: NotificationType.system,
      title: preview.subject,
      body: preview.body.slice(0, 500),
      data: { emailLogId: row.id, bookingId: booking.id, template: dto.template },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'email.send',
      entity: 'email_log',
      entityId: row.id,
      diff: { to, template: dto.template, bookingId: booking.id },
    });

    return mapEmailLog(row);
  }

  async list(query: ListEmailsQuery, user: AuthPrincipal) {
    this.assertStaff(user);
    const { page, limit, skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          booking: { select: { znCode: true } },
          sentByUser: { select: { fullName: true } },
        },
      }),
      this.prisma.emailLog.count(),
    ]);
    return { data: rows.map(mapEmailLog), meta: pageMeta(total, page, limit) };
  }

  private async loadBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: bookingDetailInclude,
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private buildPreview(booking: BookingDetail, template: EmailTemplateKey): EmailPreviewDto {
    const client = booking.client;
    const pkg = booking.package;
    const arrival = booking.arrivalDate?.toISOString().slice(0, 10) ?? 'TBD';
    const departure = booking.departureDate?.toISOString().slice(0, 10) ?? 'TBD';
    const total = decimalToNumber(booking.totalAmount);
    const paid = booking.payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
    const due = Math.max(0, total - paid);
    const vip = booking.isVip ? 'Yes (Zeen Rafeq VIP)' : 'No';

    const itinerary =
      booking.itineraryItems.length === 0
        ? 'Program items will be confirmed by ops.'
        : booking.itineraryItems
            .map((item) => {
              const date = item.itemDate?.toISOString().slice(0, 10) ?? `Day ${item.dayNumber}`;
              const place = item.locationName ? ` — ${item.locationName}` : '';
              return `• ${date}: ${item.title}${place}`;
            })
            .join('\n');

    const latestSos = booking.sosAlerts[0];
    const greeting = `Dear ${client.fullName},`;
    const footer = `\n\nSalaam / Best regards,\nZeengo Ops\nWhatsApp ops line available 24/7`;

    let subject = '';
    let body = '';

    if (template === 'booking_confirmation') {
      subject = `Zeengo booking confirmed — ${booking.znCode}`;
      body = `${greeting}

Your Zeengo trip is confirmed.

Booking: ${booking.znCode}
Guest: ${client.fullName}
Phone: ${client.phone}
Package: ${pkg.name}
Dates: ${arrival} → ${departure}
Party size: ${booking.partySize}
VIP: ${vip}
Total: USD ${total.toFixed(2)}
Paid: USD ${paid.toFixed(2)}
Balance due: USD ${due.toFixed(2)}

Please keep this email for airport meet & greet. Quote ${booking.znCode} to your driver.${footer}`;
    } else if (template === 'itinerary_change') {
      subject = `Itinerary update — ${booking.znCode}`;
      body = `${greeting}

Your program for ${booking.znCode} has been updated.

Package: ${pkg.name}
Stay: ${arrival} → ${departure}

Current program:
${itinerary}

If anything does not match what you expected, reply to this email or WhatsApp ops.${footer}`;
    } else if (template === 'sos_followup') {
      const sosLine = latestSos
        ? `Latest SOS: ${latestSos.status} — opened ${latestSos.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`
        : 'No open SOS on this booking. This is a welfare check from ops.';
      subject = `SOS follow-up — ${booking.znCode}`;
      body = `${greeting}

Zeengo ops is following up on your welfare for booking ${booking.znCode}.

${sosLine}

Guest: ${client.fullName}
Phone: ${client.phone}
Dates: ${arrival} → ${departure}

If you still need help, reply immediately or call the emergency line. If you are safe, a short reply is enough.${footer}`;
    } else {
      const payLines =
        booking.payments.length === 0
          ? 'No payments recorded yet.'
          : booking.payments
              .map(
                (p) =>
                  `• ${p.createdAt.toISOString().slice(0, 10)} — ${p.method} — ${p.status} — USD ${decimalToNumber(p.amount).toFixed(2)}`,
              )
              .join('\n');
      subject = `Invoice / receipt — ${booking.znCode}`;
      body = `${greeting}

Invoice summary for ${booking.znCode}.

Package: ${pkg.name}
Dates: ${arrival} → ${departure}
Party: ${booking.partySize}
VIP: ${vip}

Total: USD ${total.toFixed(2)}
Paid: USD ${paid.toFixed(2)}
Balance due: USD ${due.toFixed(2)}

Payments:
${payLines}

This is your official Zeengo receipt copy.${footer}`;
    }

    return {
      to: client.email,
      toName: client.fullName,
      template,
      templateName: templateName(template),
      subject,
      body,
      bookingId: booking.id,
      znCode: booking.znCode,
    };
  }

  private assertStaff(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !EMAIL_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
