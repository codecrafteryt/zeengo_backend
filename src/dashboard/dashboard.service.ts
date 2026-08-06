import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BookingStatus,
  DriverStatus,
  EditRequestStatus,
  ItineraryItemStatus,
  PaymentStatus,
  Prisma,
  SosStatus,
  StaffRole,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { decimalToNumber } from '../common/decimal.util';
import {
  CreateEodReportDto,
  DashboardDriverDto,
  DashboardOverviewDto,
  DashboardScheduleQuery,
  DashboardSummaryDto,
  UnassignedClientDto,
  UrgentAlertDto,
} from './dashboard.schema';
import { mapEodReport, mapScheduleItem } from './dashboard.mapper';

/** Short TTL — dashboard cards refresh via realtime invalidation + this cache. */
const SUMMARY_CACHE_KEY = 'dashboard:summary:v2';
const OVERVIEW_CACHE_KEY = 'dashboard:overview:v1';
const ALERTS_CACHE_KEY = 'dashboard:alerts:v1';
const CACHE_TTL_SECONDS = 20;

const DASHBOARD_ROLES: StaffRole[] = [StaffRole.admin, StaffRole.ops_manager];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOverview(_user: AuthPrincipal): Promise<DashboardOverviewDto> {
    const cached =
      await this.redis.getJson<DashboardOverviewDto>(OVERVIEW_CACHE_KEY);
    if (cached) return cached;

    const [summary, alerts, unassigned, drivers] = await Promise.all([
      this.computeSummary(),
      this.computeUrgentAlerts(),
      this.listUnassignedClients(12),
      this.listDashboardDrivers(24),
    ]);

    const payload: DashboardOverviewDto = {
      summary,
      alerts,
      unassigned,
      drivers,
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: CACHE_TTL_SECONDS,
    };

    await Promise.all([
      this.redis.setJson(OVERVIEW_CACHE_KEY, payload, CACHE_TTL_SECONDS),
      this.redis.setJson(SUMMARY_CACHE_KEY, summary, CACHE_TTL_SECONDS),
      this.redis.setJson(ALERTS_CACHE_KEY, alerts, CACHE_TTL_SECONDS),
    ]);

    return payload;
  }

  async getSummary(_user: AuthPrincipal): Promise<DashboardSummaryDto> {
    const cached =
      await this.redis.getJson<DashboardSummaryDto>(SUMMARY_CACHE_KEY);
    if (cached) return cached;

    const summary = await this.computeSummary();
    await this.redis.setJson(SUMMARY_CACHE_KEY, summary, CACHE_TTL_SECONDS);
    return summary;
  }

  async getUrgentAlerts(): Promise<UrgentAlertDto[]> {
    const cached = await this.redis.getJson<UrgentAlertDto[]>(ALERTS_CACHE_KEY);
    if (cached) return cached;

    const alerts = await this.computeUrgentAlerts();
    await this.redis.setJson(ALERTS_CACHE_KEY, alerts, CACHE_TTL_SECONDS);
    return alerts;
  }

  async getSchedule(query: DashboardScheduleQuery) {
    const date = this.resolveScheduleDate(query.date);
    const dateKey = this.formatDate(date);
    const cacheKey = `dashboard:schedule:${dateKey}`;

    const cached = await this.redis.getJson<{
      date: string;
      itemCount: number;
      pendingCount: number;
      activeCount: number;
      doneCount: number;
      items: ReturnType<typeof mapScheduleItem>[];
    }>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.itineraryItem.findMany({
      where: { itemDate: date },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
      take: 200,
      select: {
        id: true,
        bookingId: true,
        dayNumber: true,
        itemDate: true,
        startTime: true,
        title: true,
        description: true,
        locationName: true,
        lat: true,
        lng: true,
        vendorId: true,
        driverId: true,
        status: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        booking: {
          select: {
            znCode: true,
            client: { select: { fullName: true } },
          },
        },
      },
    });

    const items = rows.map(mapScheduleItem);
    const payload = {
      date: dateKey,
      itemCount: items.length,
      pendingCount: items.filter((i) => i.status === 'pending').length,
      activeCount: items.filter((i) => i.status === 'active').length,
      doneCount: items.filter((i) => i.status === 'done').length,
      items,
    };

    await this.redis.setJson(cacheKey, payload, CACHE_TTL_SECONDS);
    return payload;
  }

  async createEodReport(user: AuthPrincipal, dto: CreateEodReportDto) {
    const reportDate = dto.reportDate
      ? new Date(dto.reportDate)
      : this.todayUtc();

    const existing = await this.prisma.eodReport.findUnique({
      where: { reportDate },
    });
    if (existing) {
      throw AppError.conflict(
        'EOD_REPORT_EXISTS',
        'End-of-day report already exists for this date',
      );
    }

    const summary = await this.computeSummary();
    const content = this.buildEodStubContent(reportDate, summary);

    const row = await this.prisma.eodReport.create({
      data: {
        reportDate,
        content,
        generatedBy: user.sub,
      },
    });

    await this.invalidateDashboardCache();
    return mapEodReport(row);
  }

  async sendEodReport(id: string) {
    const existing = await this.prisma.eodReport.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('EOD_REPORT_NOT_FOUND', 'EOD report not found');
    }

    if (existing.sentAt) {
      throw AppError.conflict('EOD_ALREADY_SENT', 'EOD report was already sent');
    }

    const row = await this.prisma.eodReport.update({
      where: { id },
      data: { sentAt: new Date() },
    });

    return mapEodReport(row);
  }

  assertDashboardAccess(user: AuthPrincipal) {
    if (
      user.type !== 'staff' ||
      !user.role ||
      !DASHBOARD_ROLES.includes(user.role)
    ) {
      throw AppError.forbidden();
    }
  }

  /** Drop cached aggregates when ops events change dashboard numbers. */
  async invalidateDashboardCache() {
    await this.redis.del(
      OVERVIEW_CACHE_KEY,
      SUMMARY_CACHE_KEY,
      ALERTS_CACHE_KEY,
    );
  }

  /**
   * All counters are parallel Postgres aggregates — no full-table loads.
   * Safe under high concurrency with Redis layer on top.
   */
  private async computeSummary(): Promise<DashboardSummaryDto> {
    const today = this.todayUtc();
    const tomorrow = this.addDays(today, 1);

    const unassignedWhere = this.unassignedBookingWhere(today);

    const [
      activeClients,
      urgentTasks,
      driversInField,
      revenueAgg,
      todaysItinerary,
      todaysDone,
      unassignedClients,
      pendingEdits,
      openTasks,
      activeSos,
    ] = await Promise.all([
      this.prisma.booking.count({ where: { status: BookingStatus.active } }),
      this.prisma.task.count({
        where: { status: TaskStatus.open, priority: TaskPriority.urgent },
      }),
      this.prisma.driverProfile.count({
        where: { status: DriverStatus.en_route },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.paid,
          paidAt: { gte: today, lt: tomorrow },
        },
        _sum: { amount: true },
      }),
      this.prisma.itineraryItem.count({ where: { itemDate: today } }),
      this.prisma.itineraryItem.count({
        where: { itemDate: today, status: ItineraryItemStatus.done },
      }),
      this.prisma.booking.count({ where: unassignedWhere }),
      this.prisma.editRequest.count({
        where: { status: EditRequestStatus.pending },
      }),
      this.prisma.task.count({ where: { status: TaskStatus.open } }),
      this.prisma.sosAlert.count({ where: { status: SosStatus.active } }),
    ]);

    const itineraryProgress =
      todaysItinerary > 0
        ? Math.round((todaysDone / todaysItinerary) * 100)
        : 0;

    return {
      activeClients,
      urgentTasks,
      driversInField,
      revenueToday: decimalToNumber(revenueAgg._sum.amount),
      todaysItinerary,
      itineraryProgress,
      unassignedClients,
      opsQueue: pendingEdits + openTasks + urgentTasks,
      activeSos,
      pendingEdits,
    };
  }

  private async computeUrgentAlerts(): Promise<UrgentAlertDto[]> {
    const alerts: UrgentAlertDto[] = [];

    const [sosAlerts, urgentTasks, pendingEdits] = await Promise.all([
      this.prisma.sosAlert.findMany({
        where: { status: SosStatus.active },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          message: true,
          createdAt: true,
          booking: {
            select: {
              znCode: true,
              client: { select: { fullName: true } },
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: { status: TaskStatus.open, priority: TaskPriority.urgent },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          booking: { select: { znCode: true } },
        },
      }),
      this.prisma.editRequest.findMany({
        where: { status: EditRequestStatus.pending },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          type: true,
          createdAt: true,
          booking: {
            select: {
              znCode: true,
              client: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

    for (const sos of sosAlerts) {
      alerts.push({
        type: 'sos',
        severity: 'high',
        title: `SOS — ${sos.booking.znCode}`,
        message:
          sos.message ?? `Active SOS from ${sos.booking.client.fullName}`,
        entityId: sos.id,
        createdAt: sos.createdAt.toISOString(),
        znCode: sos.booking.znCode,
        clientName: sos.booking.client.fullName,
      });
    }

    for (const task of urgentTasks) {
      alerts.push({
        type: 'task',
        severity: 'high',
        title: task.title,
        message: task.description ?? 'Urgent task requires attention',
        entityId: task.id,
        createdAt: task.createdAt.toISOString(),
        znCode: task.booking?.znCode ?? null,
      });
    }

    for (const edit of pendingEdits) {
      alerts.push({
        type: 'edit_request',
        severity: 'medium',
        title: `Edit request — ${edit.booking.znCode}`,
        message: `${edit.type} pending review for ${edit.booking.client.fullName}`,
        entityId: edit.id,
        createdAt: edit.createdAt.toISOString(),
        znCode: edit.booking.znCode,
        clientName: edit.booking.client.fullName,
      });
    }

    alerts.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return alerts.slice(0, 20);
  }

  private unassignedBookingWhere(asOf: Date): Prisma.BookingWhereInput {
    return {
      status: BookingStatus.active,
      driverAssignments: {
        none: {
          status: AssignmentStatus.active,
          startDate: { lte: asOf },
          OR: [{ endDate: null }, { endDate: { gte: asOf } }],
        },
      },
    };
  }

  private async listUnassignedClients(
    take: number,
  ): Promise<UnassignedClientDto[]> {
    const asOf = this.todayUtc();
    const rows = await this.prisma.booking.findMany({
      where: this.unassignedBookingWhere(asOf),
      orderBy: { arrivalDate: 'asc' },
      take,
      select: {
        id: true,
        znCode: true,
        arrivalDate: true,
        client: { select: { fullName: true } },
        package: { select: { name: true } },
      },
    });

    return rows.map((b) => ({
      bookingId: b.id,
      znCode: b.znCode,
      clientName: b.client.fullName,
      packageName: b.package?.name ?? null,
      arrivalDate: b.arrivalDate?.toISOString().slice(0, 10) ?? null,
    }));
  }

  private async listDashboardDrivers(
    take: number,
  ): Promise<DashboardDriverDto[]> {
    const rows = await this.prisma.driverProfile.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take,
      select: {
        id: true,
        status: true,
        vehicleMake: true,
        vehicleModel: true,
        plateNumber: true,
        rating: true,
        user: { select: { fullName: true, phone: true } },
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          take: 1,
          orderBy: { startDate: 'desc' },
          select: { booking: { select: { znCode: true } } },
        },
      },
    });

    return rows.map((d) => ({
      id: d.id,
      fullName: d.user.fullName,
      phone: d.user.phone,
      status: d.status,
      vehicleMake: d.vehicleMake,
      vehicleModel: d.vehicleModel,
      plateNumber: d.plateNumber,
      rating: decimalToNumber(d.rating),
      activeAssignmentZn: d.driverAssignments[0]?.booking.znCode ?? null,
    }));
  }

  private buildEodStubContent(
    reportDate: Date,
    summary: DashboardSummaryDto,
  ): string {
    const dateStr = this.formatDate(reportDate);
    return [
      `# End of Day Report — ${dateStr}`,
      '',
      '## Summary',
      `- Active clients: ${summary.activeClients}`,
      `- Revenue today: $${summary.revenueToday.toFixed(2)}`,
      `- Drivers in field: ${summary.driversInField}`,
      `- Today's itinerary items: ${summary.todaysItinerary}`,
      `- Itinerary progress: ${summary.itineraryProgress}%`,
      `- Urgent tasks: ${summary.urgentTasks}`,
      `- Unassigned clients: ${summary.unassignedClients}`,
      `- Active SOS: ${summary.activeSos}`,
      `- Ops queue: ${summary.opsQueue}`,
      '',
      `_Generated at ${new Date().toISOString()}_`,
    ].join('\n');
  }

  private resolveScheduleDate(input: 'today' | 'tomorrow'): Date {
    const base = this.todayUtc();
    if (input === 'tomorrow') {
      return this.addDays(base, 1);
    }
    return base;
  }

  private todayUtc(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
