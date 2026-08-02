import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  EditRequestStatus,
  EditRequestType,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { decimalToNumber } from '../common/decimal.util';
import { EditRequestsService } from '../edit-requests/edit-requests.service';
import { mapEditRequest } from '../edit-requests/edit-requests.mapper';
import { ActivateVipDto, VipRequestDto } from './vip.schema';
import { mapVipClient, VipOverviewDto } from './vip.mapper';

const VIP_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
];

@Injectable()
export class VipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly editRequests: EditRequestsService,
  ) {}

  async overview(user: AuthPrincipal): Promise<VipOverviewDto> {
    this.assertStaffRead(user);

    const [totalVipBookings, pendingUpgradeRequests, vipRevenueAgg] =
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
      ]);

    return {
      totalVipBookings,
      pendingUpgradeRequests,
      vipRevenue: decimalToNumber(vipRevenueAgg._sum.totalAmount),
    };
  }

  async activate(dto: ActivateVipDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { client: true },
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
      include: { client: true },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vip.activate',
      entity: 'booking',
      entityId: dto.bookingId,
      diff: { vipPrice, newTotal },
    });

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
      include: { booking: true, reviewedByUser: true },
    });

    return rows.map(mapEditRequest);
  }

  async listVipClients(user: AuthPrincipal) {
    this.assertStaffRead(user);

    const rows = await this.prisma.booking.findMany({
      where: { isVip: true },
      orderBy: { vipActivatedAt: 'desc' },
      include: { client: true },
    });

    return rows.map(mapVipClient);
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
    const allowed = new Set<StaffRole>([
      StaffRole.admin,
      StaffRole.ops_manager,
      StaffRole.support,
    ]);
    if (user.type !== 'staff' || !user.role || !allowed.has(user.role)) {
      throw AppError.forbidden();
    }
  }
}
