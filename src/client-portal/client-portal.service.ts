import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { decimalToNumber } from '../common/decimal.util';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import { CLIENT_VISIBLE_ASSIGNMENT_STATUSES } from '../drivers/assignment.util';
import type { ListClientTasksQuery } from './client-portal.schema';

@Injectable()
export class ClientPortalService {
  constructor(private readonly prisma: PrismaService) {}

  async home(user: AuthPrincipal) {
    this.assertClient(user);
    const booking = await this.activeBookingForClient(user.sub);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayItems, payments, latestAssignment, openTasks] = await Promise.all([
      this.prisma.itineraryItem.findMany({
        where: {
          bookingId: booking.id,
          OR: [
            { itemDate: { gte: today, lt: tomorrow } },
            {
              itemDate: null,
              dayNumber: this.dayNumberFor(booking.arrivalDate, today),
            },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
        include: { vendor: true, driver: { include: { user: true } } },
      }),
      this.prisma.payment.findMany({
        where: { bookingId: booking.id },
        select: { amount: true, status: true },
      }),
      this.prisma.driverAssignment.findFirst({
        where: { bookingId: booking.id },
        orderBy: { createdAt: 'desc' },
        include: { driver: { include: { user: true } } },
      }),
      this.prisma.task.findMany({
        where: { bookingId: booking.id, status: TaskStatus.open },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 20,
        include: { booking: true },
      }),
    ]);

    const visibleAssignment =
      latestAssignment &&
      CLIENT_VISIBLE_ASSIGNMENT_STATUSES.includes(latestAssignment.status)
        ? latestAssignment
        : null;

    const paid = payments
      .filter((p) => p.status === PaymentStatus.paid)
      .reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
    const total = decimalToNumber(booking.totalAmount);
    const driver =
      visibleAssignment?.driver ??
      todayItems.find((i) => i.driver)?.driver ??
      null;

    return {
      bookingId: booking.id,
      znCode: booking.znCode,
      status: booking.status,
      clientName: booking.client.fullName,
      packageName: booking.package?.name ?? null,
      packageId: booking.packageId,
      partySize: booking.partySize,
      guests: booking.partySize,
      arrivalDate: booking.arrivalDate?.toISOString().slice(0, 10) ?? null,
      departureDate: booking.departureDate?.toISOString().slice(0, 10) ?? null,
      daysLeft: this.daysLeft(booking.departureDate, today),
      isVip: booking.isVip,
      balance: {
        total,
        paid,
        due: Math.max(0, Math.round((total - paid) * 100) / 100),
      },
      todayProgram: todayItems.map((item) => this.mapClientActivity(item, booking.znCode)),
      tasks: openTasks.map((t) => this.mapClientTask(t)),
      assignment: latestAssignment
        ? {
            id: latestAssignment.id,
            status: latestAssignment.status,
            acceptedAt: latestAssignment.acceptedAt?.toISOString() ?? null,
            startedAt: latestAssignment.startedAt?.toISOString() ?? null,
            completedAt: latestAssignment.completedAt?.toISOString() ?? null,
          }
        : null,
      driver: driver
        ? {
            name: driver.user.fullName,
            phone: driver.user.phone,
            vehicle: [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' '),
          }
        : null,
    };
  }

  async listTasks(user: AuthPrincipal, query: ListClientTasksQuery) {
    this.assertClient(user);
    const booking = await this.activeBookingForClient(user.sub);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.TaskWhereInput = { bookingId: booking.id };

    if (query.status) {
      where.status = query.status;
    } else if (query.filter === 'open') {
      where.status = TaskStatus.open;
    } else if (query.filter === 'done') {
      where.status = TaskStatus.done;
    }

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: { booking: true },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      znCode: booking.znCode,
      bookingId: booking.id,
      data: rows.map((t) => this.mapClientTask(t)),
      meta: pageMeta(total, page, limit),
    };
  }

  async getTask(user: AuthPrincipal, taskId: string) {
    this.assertClient(user);
    const booking = await this.activeBookingForClient(user.sub);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, bookingId: booking.id },
      include: { booking: true },
    });
    if (!task) throw AppError.notFound('TASK_NOT_FOUND', 'Task not found');
    return this.mapClientTask(task);
  }
  async itinerary(user: AuthPrincipal) {
    this.assertClient(user);
    const booking = await this.activeBookingForClient(user.sub);
    const [items, dayPlans] = await Promise.all([
      this.prisma.itineraryItem.findMany({
        where: { bookingId: booking.id },
        orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { startTime: 'asc' }],
        include: { vendor: true },
      }),
      this.prisma.bookingDayPlan.findMany({ where: { bookingId: booking.id } }),
    ]);

    const dayNumbers = new Set<number>();
    for (const item of items) dayNumbers.add(item.dayNumber);
    for (const plan of dayPlans) dayNumbers.add(plan.dayNumber);
    const plansByDay = new Map(dayPlans.map((p) => [p.dayNumber, p]));

    return {
      znCode: booking.znCode,
      days: [...dayNumbers]
        .sort((a, b) => a - b)
        .map((dayNumber) => {
          const dayItems = items.filter((i) => i.dayNumber === dayNumber);
          const plan = plansByDay.get(dayNumber);
          return {
            dayNumber,
            planDate:
              plan?.planDate?.toISOString().slice(0, 10) ??
              dayItems[0]?.itemDate?.toISOString().slice(0, 10) ??
              null,
            carPlan: plan?.carPlan ?? null,
            notes: plan?.notes ?? null,
            activities: dayItems.map((i) => this.mapClientActivity(i, booking.znCode)),
          };
        }),
    };
  }

  async activity(user: AuthPrincipal, activityId: string) {
    this.assertClient(user);
    const booking = await this.activeBookingForClient(user.sub);
    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: activityId, bookingId: booking.id },
      include: { vendor: true },
    });
    if (!item) throw AppError.notFound('ACTIVITY_NOT_FOUND', 'Activity not found');
    return this.mapClientActivity(item, booking.znCode);
  }

  private mapClientActivity(
    item: {
      id: string;
      dayNumber: number;
      itemDate: Date | null;
      startTime: Date | null;
      title: string;
      description: string | null;
      locationName: string | null;
      status: string;
      carPlan: string | null;
      meetingPoint: string | null;
      guideContact: string | null;
      pdfUrl: string | null;
      notes: string | null;
      vendor?: { name: string; type: string } | null;
    },
    znCode: string,
  ) {
    return {
      id: item.id,
      dayNumber: item.dayNumber,
      itemDate: item.itemDate?.toISOString().slice(0, 10) ?? null,
      startTime: item.startTime ? item.startTime.toISOString().slice(11, 19) : null,
      title: item.title,
      description: item.description,
      locationName: item.locationName,
      status: item.status,
      carPlan: item.carPlan,
      meetingPoint: item.meetingPoint,
      guideContact: item.guideContact,
      pdfUrl: item.pdfUrl,
      notes: item.notes,
      vendorName: item.vendor?.name ?? null,
      vendorType: item.vendor?.type ?? null,
      qrPayload: JSON.stringify({
        znCode,
        activityId: item.id,
        title: item.title,
        pdfUrl: item.pdfUrl,
      }),
    };
  }

  private mapClientTask(task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    dueDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    bookingId: string | null;
    booking?: { znCode: string } | null;
  }) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      bookingId: task.bookingId,
      znCode: task.booking?.znCode ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private daysLeft(departure: Date | null, today: Date) {
    if (!departure) return null;
    const d = Date.UTC(
      departure.getUTCFullYear(),
      departure.getUTCMonth(),
      departure.getUTCDate(),
    );
    const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return Math.max(0, Math.floor((d - t) / 86400000));
  }

  private dayNumberFor(arrival: Date | null, today: Date) {
    if (!arrival) return 1;
    const a = Date.UTC(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate());
    const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return Math.max(1, Math.floor((t - a) / 86400000) + 1);
  }

  private async activeBookingForClient(clientId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        clientId,
        status: { in: [BookingStatus.active, BookingStatus.completed] },
      },
      orderBy: [{ status: 'asc' }, { arrivalDate: 'desc' }],
      include: { client: true, package: true },
    });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'No booking for this client');
    return booking;
  }

  private assertClient(user: AuthPrincipal) {
    if (user.type !== 'client') throw AppError.forbidden();
  }
}
