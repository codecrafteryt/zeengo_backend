import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  SosStatus,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { pageMeta, parseSort, toSkipTake } from '../common/pagination/pagination';
import { CreateSosDto, ListSosQuery } from './sos.schema';
import { mapSosAlert } from './sos.mapper';

const SOS_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
];

const SOS_RESOLVE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const sosInclude = {
  booking: true,
  resolvedByUser: true,
} satisfies Prisma.SosAlertInclude;

@Injectable()
export class SosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEmitter,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateSosDto, user: AuthPrincipal) {
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

    const defaultMessage = `🆘 طوارئ — حجز ${booking.znCode} — أحتاج مساعدة فورية`;
    const row = await this.prisma.sosAlert.create({
      data: {
        bookingId: booking.id,
        message: dto.message ?? defaultMessage,
        lat: dto.lat,
        lng: dto.lng,
      },
      include: sosInclude,
    });

    const payload = mapSosAlert(row);
    this.realtime.emit('sos.created', payload, [
      `role:${StaffRole.admin}`,
      `role:${StaffRole.ops_manager}`,
      `role:${StaffRole.support}`,
    ]);

    await this.notifications.createAndFanout({
      staffRoles: [StaffRole.admin, StaffRole.ops_manager, StaffRole.support],
      type: 'sos',
      title: `SOS — ${booking.znCode}`,
      body: row.message ?? defaultMessage,
      data: { sosId: row.id, bookingId: booking.id, lat: dto.lat, lng: dto.lng },
    });

    await this.audit.log({
      actorType: 'client',
      actorId: user.sub,
      action: 'sos.create',
      entity: 'sos_alert',
      entityId: row.id,
      diff: { bookingId: booking.id, znCode: booking.znCode },
    });

    return payload;
  }

  async list(query: ListSosQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.SosAlertWhereInput = {};
    if (query.status) where.status = query.status;

    const orderBy = parseSort(query.sort, ['createdAt', 'status'], {
      field: 'createdAt',
      dir: 'desc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.sosAlert.findMany({
        where,
        orderBy,
        skip,
        take,
        include: sosInclude,
      }),
      this.prisma.sosAlert.count({ where }),
    ]);

    return { data: rows.map(mapSosAlert), meta: pageMeta(total, page, limit) };
  }

  async getById(id: string, user: AuthPrincipal) {
    const row = await this.ensureSos(id);
    if (user.type === 'client') {
      const booking = await this.prisma.booking.findUnique({
        where: { id: row.bookingId },
      });
      if (!booking || booking.clientId !== user.sub) {
        throw AppError.forbidden();
      }
    } else {
      this.assertStaffRead(user);
    }
    return mapSosAlert(row);
  }

  async resolve(id: string, user: AuthPrincipal) {
    this.assertResolver(user);
    const existing = await this.ensureSos(id);

    if (existing.status === SosStatus.resolved) {
      throw AppError.conflict('SOS_ALREADY_RESOLVED', 'SOS alert already resolved');
    }

    const row = await this.prisma.sosAlert.update({
      where: { id },
      data: {
        status: SosStatus.resolved,
        resolvedBy: user.sub,
        resolvedAt: new Date(),
      },
      include: sosInclude,
    });

    const payload = mapSosAlert(row);
    this.realtime.emit('sos.resolved', payload, [
      `role:${StaffRole.admin}`,
      `role:${StaffRole.ops_manager}`,
      `role:${StaffRole.support}`,
    ]);

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'sos.resolve',
      entity: 'sos_alert',
      entityId: id,
    });

    return payload;
  }

  private async ensureSos(id: string) {
    const row = await this.prisma.sosAlert.findUnique({
      where: { id },
      include: sosInclude,
    });
    if (!row) {
      throw AppError.notFound('SOS_NOT_FOUND', 'SOS alert not found');
    }
    return row;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !SOS_READ_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }

  private assertResolver(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !SOS_RESOLVE_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
