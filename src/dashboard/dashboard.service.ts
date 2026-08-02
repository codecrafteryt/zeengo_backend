import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BookingStatus,
  DriverStatus,
  EditRequestStatus,
  PaymentStatus,
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
  DashboardScheduleQuery,
  DashboardSummaryDto,
  UrgentAlertDto,
} from './dashboard.schema';
import { mapEodReport, mapScheduleItem } from './dashboard.mapper';

const SUMMARY_CACHE_KEY = 'dashboard:summary';
const SUMMARY_TTL_SECONDS = 30;

const DASHBOARD_ROLES: StaffRole[] = [StaffRole.admin, StaffRole.ops_manager];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSummary(_user: AuthPrincipal): Promise<DashboardSummaryDto> {
    const cached = await this.redis.getJson<DashboardSummaryDto>(SUMMARY_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const summary = await this.computeSummary();
    await this.redis.setJson(SUMMARY_CACHE_KEY, summary, SUMMARY_TTL_SECONDS);
    return summary;
  }

  async getUrgentAlerts(): Promise<UrgentAlertDto[]> {
    const alerts: UrgentAlertDto[] = [];

    const [sosAlerts, urgentTasks, pendingEdits, unassignedBookings] =
      await Promise.all([
        this.prisma.sosAlert.findMany({
          where: { status: SosStatus.active },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { booking: { include: { client: true } } },
        }),
        this.prisma.task.findMany({
          where: { status: TaskStatus.open, priority: TaskPriority.urgent },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.editRequest.findMany({
          where: { status: EditRequestStatus.pending },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { booking: { include: { client: true } } },
        }),
        this.findUnassignedActiveBookings(),
      ]);

    for (const sos of sosAlerts) {
      alerts.push({
        type: 'sos',
        severity: 'high',
        title: `SOS — ${sos.booking.znCode}`,
        message: sos.message ?? `Active SOS from ${sos.booking.client.fullName}`,
        entityId: sos.id,
        createdAt: sos.createdAt.toISOString(),
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
      });
    }

    for (const booking of unassignedBookings.slice(0, 5)) {
      alerts.push({
        type: 'unassigned_client',
        severity: 'medium',
        title: `Unassigned — ${booking.znCode}`,
        message: `${booking.client.fullName} has no active driver assignment`,
        entityId: booking.id,
        createdAt: booking.createdAt.toISOString(),
      });
    }

    alerts.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return alerts;
  }

  async getSchedule(query: DashboardScheduleQuery) {
    const date = this.resolveScheduleDate(query.date);

    const rows = await this.prisma.itineraryItem.findMany({
      where: { itemDate: date },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
      include: {
        booking: { include: { client: true } },
      },
    });

    const items = rows.map(mapScheduleItem);

    return {
      date: this.formatDate(date),
      itemCount: items.length,
      pendingCount: items.filter((i) => i.status === 'pending').length,
      activeCount: items.filter((i) => i.status === 'active').length,
      doneCount: items.filter((i) => i.status === 'done').length,
      items,
    };
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

  private async computeSummary(): Promise<DashboardSummaryDto> {
    const today = this.todayUtc();
    const tomorrow = this.addDays(today, 1);
    const dayStart = today;
    const dayEnd = tomorrow;

    const [
      activeClients,
      urgentTasks,
      driversInField,
      revenueAgg,
      todaysItinerary,
      unassignedClients,
      pendingEdits,
      openTasks,
    ] = await Promise.all([
      this.prisma.booking.count({ where: { status: BookingStatus.active } }),
      this.prisma.task.count({
        where: { status: TaskStatus.open, priority: TaskPriority.urgent },
      }),
      this.prisma.driverProfile.count({
        where: {
          status: { in: [DriverStatus.available, DriverStatus.en_route] },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.paid,
          paidAt: { gte: dayStart, lt: dayEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.itineraryItem.count({ where: { itemDate: today } }),
      this.countUnassignedClients(today),
      this.prisma.editRequest.count({
        where: { status: EditRequestStatus.pending },
      }),
      this.prisma.task.count({ where: { status: TaskStatus.open } }),
    ]);

    return {
      activeClients,
      urgentTasks,
      driversInField,
      revenueToday: decimalToNumber(revenueAgg._sum.amount),
      todaysItinerary,
      unassignedClients,
      opsQueue: pendingEdits + openTasks,
    };
  }

  private async countUnassignedClients(today: Date): Promise<number> {
    const bookings = await this.findUnassignedActiveBookings(today);
    return bookings.length;
  }

  private async findUnassignedActiveBookings(asOf = this.todayUtc()) {
    const activeBookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.active },
      include: {
        client: true,
        driverAssignments: {
          where: {
            status: AssignmentStatus.active,
            startDate: { lte: asOf },
            OR: [{ endDate: null }, { endDate: { gte: asOf } }],
          },
        },
      },
    });

    return activeBookings.filter((b) => b.driverAssignments.length === 0);
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
      `- Revenue today: SAR ${summary.revenueToday.toFixed(2)}`,
      `- Drivers in field: ${summary.driversInField}`,
      `- Today's itinerary items: ${summary.todaysItinerary}`,
      `- Urgent tasks: ${summary.urgentTasks}`,
      `- Unassigned clients: ${summary.unassignedClients}`,
      `- Ops queue: ${summary.opsQueue}`,
      '',
      '_AI-generated narrative will be added in a future release._',
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
