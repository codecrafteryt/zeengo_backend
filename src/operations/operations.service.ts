import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BookingStatus,
  ItineraryItemStatus,
  PaymentStatus,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { decimalToNumber } from '../common/decimal.util';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import {
  CreateStaffLinkDto,
  ListOperationsQuery,
  UpdateOpsItemDto,
  UpsertDayPlanDto,
} from './operations.schema';
import {
  mapOpsActivity,
  mapOpsDay,
  mapStaffLink,
  type OpsBookingDetail,
  type OpsClientCard,
} from './operations.mapper';

const OPS_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(query: ListOperationsQuery, user: AuthPrincipal) {
    this.assertOps(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.BookingWhereInput = {};
    if (query.status) where.status = query.status as BookingStatus;
    else where.status = BookingStatus.active;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { znCode: { contains: search, mode: 'insensitive' } },
        { client: { fullName: { contains: search, mode: 'insensitive' } } },
        { client: { phone: { contains: search } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          client: true,
          package: true,
          itineraryItems: { select: { title: true, status: true } },
          staffLinks: {
            where: { role: 'coordinator' },
            include: { staff: true },
            take: 1,
          },
          driverAssignments: {
            where: { status: AssignmentStatus.active },
            include: { driver: { include: { user: true } } },
            take: 1,
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const data: OpsClientCard[] = rows.map((row) => {
      const pending = row.itineraryItems.filter((i) => i.status === 'pending');
      return {
        bookingId: row.id,
        znCode: row.znCode,
        clientName: row.client.fullName,
        clientPhone: row.client.phone,
        packageName: row.package?.name ?? null,
        status: row.status,
        arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
        departureDate: row.departureDate?.toISOString().slice(0, 10) ?? null,
        partySize: row.partySize,
        pendingItems: pending.length,
        totalItems: row.itineraryItems.length,
        notConfirmedTitles: pending.slice(0, 5).map((p) => p.title),
        coordinatorName: row.staffLinks[0]?.staff.fullName ?? null,
        driverName: row.driverAssignments[0]?.driver.user.fullName ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return { data, meta: pageMeta(total, page, limit) };
  }

  async getBooking(bookingId: string, user: AuthPrincipal): Promise<OpsBookingDetail> {
    this.assertOps(user);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: true,
        package: true,
        itineraryItems: {
          include: { vendor: true },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { startTime: 'asc' }],
        },
        dayPlans: true,
        staffLinks: { include: { staff: true }, orderBy: { createdAt: 'asc' } },
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        editRequests: { orderBy: { createdAt: 'desc' }, take: 20 },
        payments: { orderBy: { createdAt: 'desc' }, take: 50 },
        driverAssignments: {
          where: { status: AssignmentStatus.active },
          include: { driver: { include: { user: true } } },
          take: 1,
        },
      },
    });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');

    const dayNumbers = new Set<number>();
    for (const item of booking.itineraryItems) dayNumbers.add(item.dayNumber);
    for (const plan of booking.dayPlans) dayNumbers.add(plan.dayNumber);
    if (dayNumbers.size === 0) dayNumbers.add(1);

    const plansByDay = new Map(booking.dayPlans.map((p) => [p.dayNumber, p]));
    const days = [...dayNumbers]
      .sort((a, b) => a - b)
      .map((dayNumber) => {
        const activities = booking.itineraryItems
          .filter((i) => i.dayNumber === dayNumber)
          .map((i) => mapOpsActivity(i, booking.znCode));
        return mapOpsDay(dayNumber, plansByDay.get(dayNumber), activities);
      });

    const totalAmount = decimalToNumber(booking.totalAmount);
    const paidAmount = booking.payments
      .filter((p) => p.status === PaymentStatus.paid)
      .reduce((sum, p) => sum + decimalToNumber(p.amount), 0);
    const driver = booking.driverAssignments[0]?.driver;

    return {
      bookingId: booking.id,
      znCode: booking.znCode,
      clientName: booking.client.fullName,
      clientPhone: booking.client.phone,
      clientEmail: booking.client.email,
      nationality: booking.client.nationality,
      packageName: booking.package?.name ?? null,
      status: booking.status,
      arrivalDate: booking.arrivalDate?.toISOString().slice(0, 10) ?? null,
      departureDate: booking.departureDate?.toISOString().slice(0, 10) ?? null,
      partySize: booking.partySize,
      totalAmount,
      paidAmount,
      dueAmount: Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100),
      internalNotes: booking.internalNotes,
      days,
      staff: booking.staffLinks.map(mapStaffLink),
      driverName: driver?.user.fullName ?? null,
      driverPhone: driver?.user.phone ?? null,
      checklist: booking.checklistItems.map((c) => ({
        id: c.id,
        title: c.title,
        isDone: c.isDone,
      })),
      editRequests: booking.editRequests.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
      payments: booking.payments.map((p) => ({
        id: p.id,
        amount: decimalToNumber(p.amount),
        method: p.method,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async upsertDayPlan(bookingId: string, dto: UpsertDayPlanDto, user: AuthPrincipal) {
    this.assertOps(user);
    await this.ensureBooking(bookingId);

    const row = await this.prisma.bookingDayPlan.upsert({
      where: {
        bookingId_dayNumber: { bookingId, dayNumber: dto.dayNumber },
      },
      create: {
        bookingId,
        dayNumber: dto.dayNumber,
        planDate: dto.planDate ? new Date(dto.planDate) : undefined,
        carPlan: dto.carPlan,
        notes: dto.notes,
      },
      update: {
        planDate: dto.planDate ? new Date(dto.planDate) : undefined,
        carPlan: dto.carPlan,
        notes: dto.notes,
      },
    });

    return {
      id: row.id,
      bookingId: row.bookingId,
      dayNumber: row.dayNumber,
      planDate: row.planDate?.toISOString().slice(0, 10) ?? null,
      carPlan: row.carPlan,
      notes: row.notes,
    };
  }

  async updateItem(itemId: string, dto: UpdateOpsItemDto, user: AuthPrincipal) {
    this.assertOps(user);
    const existing = await this.prisma.itineraryItem.findUnique({ where: { id: itemId } });
    if (!existing) throw AppError.notFound('ITEM_NOT_FOUND', 'Itinerary item not found');

    const row = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        status: dto.status,
        carPlan: dto.carPlan === undefined ? undefined : dto.carPlan,
        meetingPoint: dto.meetingPoint === undefined ? undefined : dto.meetingPoint,
        guideContact: dto.guideContact === undefined ? undefined : dto.guideContact,
        pdfUrl: dto.pdfUrl === undefined ? undefined : dto.pdfUrl,
        notes: dto.notes === undefined ? undefined : dto.notes,
        title: dto.title,
        locationName: dto.locationName === undefined ? undefined : dto.locationName,
        startTime:
          dto.startTime === undefined
            ? undefined
            : dto.startTime
              ? this.parseTime(dto.startTime)
              : null,
      },
      include: { vendor: true, booking: true },
    });

    return mapOpsActivity(row, row.booking.znCode);
  }

  async addStaffLink(bookingId: string, dto: CreateStaffLinkDto, user: AuthPrincipal) {
    this.assertOps(user);
    await this.ensureBooking(bookingId);
    const staff = await this.prisma.staffUser.findFirst({
      where: { id: dto.staffId, deletedAt: null, isActive: true },
    });
    if (!staff) throw AppError.notFound('STAFF_NOT_FOUND', 'Staff member not found');

    const row = await this.prisma.bookingStaffLink.upsert({
      where: {
        bookingId_staffId_role: {
          bookingId,
          staffId: dto.staffId,
          role: dto.role,
        },
      },
      create: {
        bookingId,
        staffId: dto.staffId,
        role: dto.role,
        createdBy: user.sub,
      },
      update: {},
      include: { staff: true },
    });

    return mapStaffLink(row);
  }

  async removeStaffLink(linkId: string, user: AuthPrincipal) {
    this.assertOps(user);
    const existing = await this.prisma.bookingStaffLink.findUnique({ where: { id: linkId } });
    if (!existing) throw AppError.notFound('LINK_NOT_FOUND', 'Staff link not found');
    await this.prisma.bookingStaffLink.delete({ where: { id: linkId } });
    return { id: linkId, deleted: true };
  }

  async urgentTasks(user: AuthPrincipal) {
    this.assertOps(user);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const yesterday = new Date(start);
    yesterday.setDate(yesterday.getDate() - 1);

    const items = await this.prisma.itineraryItem.findMany({
      where: {
        status: { in: [ItineraryItemStatus.pending, ItineraryItemStatus.active] },
        OR: [
          { itemDate: { gte: yesterday, lt: end } },
          {
            itemDate: null,
            booking: { status: BookingStatus.active, arrivalDate: { lte: end } },
          },
        ],
      },
      take: 40,
      orderBy: [{ itemDate: 'asc' }, { startTime: 'asc' }],
      include: {
        booking: { include: { client: true } },
      },
    });

    return items.map((item) => ({
      id: item.id,
      bookingId: item.bookingId,
      znCode: item.booking.znCode,
      clientName: item.booking.client.fullName,
      title: item.title,
      status: item.status,
      itemDate: item.itemDate?.toISOString().slice(0, 10) ?? null,
      startTime: item.startTime ? item.startTime.toISOString().slice(11, 19) : null,
    }));
  }

  private parseTime(value: string): Date {
    const normalized = value.length === 5 ? `${value}:00` : value;
    return new Date(`1970-01-01T${normalized}.000Z`);
  }

  private async ensureBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    return booking;
  }

  private assertOps(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !OPS_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
