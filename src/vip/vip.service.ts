import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ConversationType,
  EditRequestStatus,
  EditRequestType,
  ParticipantType,
  Prisma,
  SenderType,
  StaffRole,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { decimalToNumber } from '../common/decimal.util';
import { NotificationsService } from '../notifications/notifications.service';
import { EditRequestsService } from '../edit-requests/edit-requests.service';
import { mapEditRequest } from '../edit-requests/edit-requests.mapper';
import { ActivateVipDto, EscalateVipDto, VipRequestDto } from './vip.schema';
import {
  mapVipCandidate,
  mapVipClient,
  VIP_HOTLINE,
  VIP_INCLUSIONS,
  VIP_SLA_MINUTES,
  VipOverviewDto,
} from './vip.mapper';

const VIP_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
];

const VIP_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const vipBookingInclude = {
  client: true,
  package: true,
  driverAssignments: {
    where: { status: 'active' },
    include: { driver: { include: { user: true } } },
    take: 1,
  },
  vendorBookings: {
    include: { vendor: true },
    orderBy: { createdAt: 'desc' as const },
    take: 8,
  },
} satisfies Prisma.BookingInclude;

@Injectable()
export class VipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly editRequests: EditRequestsService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview(user: AuthPrincipal): Promise<VipOverviewDto> {
    this.assertStaffRead(user);

    const [totalVipBookings, pendingUpgradeRequests, vipRevenueAgg, vipPrice] =
      await Promise.all([
        this.prisma.booking.count({
          where: { isVip: true, status: BookingStatus.active },
        }),
        this.prisma.editRequest.count({
          where: {
            type: EditRequestType.vip_upgrade,
            status: EditRequestStatus.pending,
          },
        }),
        this.prisma.booking.aggregate({
          where: { isVip: true },
          _sum: { totalAmount: true },
        }),
        this.editRequests.getVipPrice(),
      ]);

    return {
      totalVipBookings,
      pendingUpgradeRequests,
      vipRevenue: decimalToNumber(vipRevenueAgg._sum.totalAmount),
      vipPrice,
      hotline: VIP_HOTLINE,
      slaMinutes: VIP_SLA_MINUTES,
      inclusions: [...VIP_INCLUSIONS],
    };
  }

  async updatePrice(amount: number, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    const rounded = Math.round(amount * 100) / 100;

    await this.prisma.setting.upsert({
      where: { key: 'vip_price' },
      update: {
        value: rounded as Prisma.InputJsonValue,
        updatedBy: user.sub,
      },
      create: {
        key: 'vip_price',
        value: rounded as Prisma.InputJsonValue,
        updatedBy: user.sub,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vip.price.update',
      entity: 'settings',
      entityId: null,
      diff: { vip_price: rounded },
    });

    return this.overview(user);
  }

  /** Active non-VIP bookings for activation dropdown. */
  async listCandidates(user: AuthPrincipal) {
    this.assertStaffRead(user);

    const rows = await this.prisma.booking.findMany({
      where: {
        isVip: false,
        status: BookingStatus.active,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { client: true, package: true },
    });

    return rows.map(mapVipCandidate);
  }

  async activate(dto: ActivateVipDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: vipBookingInclude,
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (booking.isVip) {
      throw AppError.conflict('ALREADY_VIP', 'Booking is already VIP');
    }

    const vipPrice = await this.editRequests.getVipPrice();
    const newTotal = decimalToNumber(booking.totalAmount) + vipPrice;

    const row = await this.prisma.booking.update({
      where: { id: dto.bookingId },
      data: {
        isVip: true,
        vipActivatedAt: new Date(),
        vipActivatedBy: user.sub,
        totalAmount: newTotal,
      },
      include: vipBookingInclude,
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vip.activate',
      entity: 'booking',
      entityId: dto.bookingId,
      diff: { vipPrice, newTotal },
    });

    // Auto-close any pending vip_upgrade edit requests for this booking
    await this.prisma.editRequest.updateMany({
      where: {
        bookingId: dto.bookingId,
        type: EditRequestType.vip_upgrade,
        status: EditRequestStatus.pending,
      },
      data: {
        status: EditRequestStatus.approved,
        reviewNotes: 'Activated via VIP desk',
        reviewedBy: user.sub,
        reviewedAt: new Date(),
      },
    });

    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'vip',
      title: `VIP activated: ${row.znCode}`,
      body: `${row.client?.fullName ?? 'Client'} upgraded to Zeen Rafeq VIP (+$${vipPrice}).`,
      data: { bookingId: row.id, znCode: row.znCode },
    });

    if (row.clientId) {
      await this.notifications.createAndFanout({
        recipientType: 'client',
        clientId: row.clientId,
        type: 'vip',
        title: 'Zeen Rafeq VIP activated',
        body: 'Your booking now includes 24/7 concierge and priority service.',
        data: { bookingId: row.id },
      });
    }

    return mapVipClient(row);
  }

  async listPendingRequests(user: AuthPrincipal) {
    this.assertStaffRead(user);

    const rows = await this.prisma.editRequest.findMany({
      where: {
        type: EditRequestType.vip_upgrade,
        status: EditRequestStatus.pending,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: { include: { client: true } },
        reviewedByUser: true,
      },
    });

    return rows.map(mapEditRequest);
  }

  async listVipClients(user: AuthPrincipal) {
    this.assertStaffRead(user);

    const rows = await this.prisma.booking.findMany({
      where: { isVip: true, status: BookingStatus.active },
      orderBy: [{ vipActivatedAt: 'desc' }, { createdAt: 'desc' }],
      include: vipBookingInclude,
    });

    return rows.map(mapVipClient);
  }

  async getClientFile(bookingId: string, user: AuthPrincipal) {
    this.assertStaffRead(user);

    const row = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ...vipBookingInclude,
        bookingNotes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { author: true },
        },
      },
    });
    if (!row || !row.isVip) {
      throw AppError.notFound('VIP_BOOKING_NOT_FOUND', 'VIP booking not found');
    }

    const client = mapVipClient(row);
    return {
      ...client,
      notes: row.bookingNotes.map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.author?.fullName ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async escalate(bookingId: string, dto: EscalateVipDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { client: true },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (!booking.isVip) {
      throw AppError.validation('Booking is not VIP');
    }

    const note =
      dto.note?.trim() ||
      `VIP priority escalation for ${booking.znCode} — ${booking.client?.fullName ?? 'client'}. Immediate senior ops review required.`;

    const task = await this.prisma.task.create({
      data: {
        title: `VIP escalate: ${booking.znCode}`,
        description: note,
        priority: TaskPriority.urgent,
        status: TaskStatus.open,
        bookingId: booking.id,
        createdBy: user.sub,
      },
    });

    // Team + booking support thread for @ops visibility
    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.booking_support,
        bookingId: booking.id,
        title: `@OpsManager VIP escalate ${booking.znCode}`,
      },
    });

    await this.prisma.conversationParticipant.create({
      data: {
        conversationId: conversation.id,
        participantType: ParticipantType.staff,
        participantKey: `staff:${user.sub}`,
        staffId: user.sub,
      },
    });

    // Add all ops managers / admins as participants
    const seniors = await this.prisma.staffUser.findMany({
      where: {
        role: { in: [StaffRole.admin, StaffRole.ops_manager] },
        isActive: true,
        deletedAt: null,
        id: { not: user.sub },
      },
      take: 20,
    });
    for (const s of seniors) {
      await this.prisma.conversationParticipant.create({
        data: {
          conversationId: conversation.id,
          participantType: ParticipantType.staff,
          participantKey: `staff:${s.id}`,
          staffId: s.id,
        },
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.staff,
        senderStaffId: user.sub,
        body: `🚨 VIP ESCALATION\n${note}`,
      },
    });

    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager],
      type: 'vip',
      title: `🚨 VIP escalate: ${booking.znCode}`,
      body: note,
      data: {
        bookingId: booking.id,
        znCode: booking.znCode,
        taskId: task.id,
        conversationId: conversation.id,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vip.escalate',
      entity: 'booking',
      entityId: bookingId,
      diff: { taskId: task.id, conversationId: conversation.id, note },
    });

    return {
      bookingId: booking.id,
      znCode: booking.znCode,
      taskId: task.id,
      conversationId: conversation.id,
      notified: true,
    };
  }

  async requestUpgrade(dto: VipRequestDto, user: AuthPrincipal) {
    if (user.type !== 'client') {
      throw AppError.forbidden();
    }

    const booking = await this.prisma.booking.findFirst({
      where: { clientId: user.sub, status: BookingStatus.active },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) {
      throw AppError.notFound('ACTIVE_BOOKING_NOT_FOUND', 'No active booking found');
    }
    if (booking.isVip) {
      throw AppError.conflict('ALREADY_VIP', 'Booking is already VIP');
    }

    const existing = await this.prisma.editRequest.findFirst({
      where: {
        bookingId: booking.id,
        type: EditRequestType.vip_upgrade,
        status: EditRequestStatus.pending,
      },
    });
    if (existing) {
      throw AppError.conflict('VIP_REQUEST_PENDING', 'VIP upgrade request already pending');
    }

    return this.editRequests.create(
      {
        type: EditRequestType.vip_upgrade,
        reason: dto.reason,
        requestedValue: JSON.stringify({ isVip: true }),
        originalValue: JSON.stringify({ isVip: booking.isVip }),
      },
      user,
    );
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !VIP_READ_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !VIP_WRITE_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
