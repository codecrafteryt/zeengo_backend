import { Injectable } from '@nestjs/common';
import { ItineraryItemStatus, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import {
  CreateItineraryItemDto,
  DailyOperationsQuery,
  DailyOperationsWeekQuery,
  ImportItineraryDto,
  UpdateItineraryItemDto,
} from './itineraries.schema';
import {
  DailyOperationsDayDto,
  mapDailyOperationItem,
  mapItineraryItem,
} from './itineraries.mapper';

const ITINERARY_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

@Injectable()
export class ItinerariesService {
  constructor(private readonly prisma: PrismaService) {}

  async getByBookingId(bookingId: string, user: AuthPrincipal) {
    await this.ensureBookingReadable(bookingId, user);

    const rows = await this.prisma.itineraryItem.findMany({
      where: { bookingId },
      orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { startTime: 'asc' }],
    });

    return rows.map(mapItineraryItem);
  }

  async createItem(
    bookingId: string,
    dto: CreateItineraryItemDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureBookingExists(bookingId);

    const maxSort = await this.prisma.itineraryItem.aggregate({
      where: { bookingId, dayNumber: dto.dayNumber },
      _max: { sortOrder: true },
    });

    const row = await this.prisma.itineraryItem.create({
      data: {
        bookingId,
        dayNumber: dto.dayNumber,
        itemDate: dto.itemDate ? new Date(dto.itemDate) : undefined,
        startTime: dto.startTime ? this.parseTime(dto.startTime) : undefined,
        title: dto.title,
        description: dto.description,
        locationName: dto.locationName,
        lat: dto.lat,
        lng: dto.lng,
        vendorId: dto.vendorId,
        driverId: dto.driverId,
        status: dto.status,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    return mapItineraryItem(row);
  }

  async updateItem(
    itemId: string,
    dto: UpdateItineraryItemDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    await this.ensureItemExists(itemId);

    const row = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        dayNumber: dto.dayNumber,
        itemDate: dto.itemDate ? new Date(dto.itemDate) : undefined,
        startTime:
          dto.startTime !== undefined
            ? dto.startTime
              ? this.parseTime(dto.startTime)
              : null
            : undefined,
        title: dto.title,
        description: dto.description,
        locationName: dto.locationName,
        lat: dto.lat,
        lng: dto.lng,
        vendorId: dto.vendorId,
        driverId: dto.driverId,
        status: dto.status,
        sortOrder: dto.sortOrder,
      },
    });

    return mapItineraryItem(row);
  }

  async deleteItem(itemId: string, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    await this.ensureItemExists(itemId);

    await this.prisma.itineraryItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async importItinerary(
    bookingId: string,
    dto: ImportItineraryDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    const booking = await this.ensureBookingExists(bookingId);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.itineraryItem.deleteMany({ where: { bookingId } });

      const items: Awaited<ReturnType<typeof tx.itineraryItem.create>>[] = [];

      for (const day of dto.days) {
        let sortOrder = 0;
        for (const item of day.items) {
          const itemDate =
            booking.arrivalDate && day.dayNumber > 0
              ? this.addDays(booking.arrivalDate, day.dayNumber - 1)
              : null;

          const row = await tx.itineraryItem.create({
            data: {
              bookingId,
              dayNumber: day.dayNumber,
              itemDate,
              startTime: item.time ? this.parseTime(item.time) : undefined,
              title: item.title,
              description: item.description,
              locationName: item.locationName,
              lat: item.lat,
              lng: item.lng,
              sortOrder: sortOrder++,
            },
          });
          items.push(row);
        }
      }

      return items;
    });

    return created.map(mapItineraryItem);
  }

  async dailyOperations(query: DailyOperationsQuery) {
    const date = new Date(query.date);

    const rows = await this.prisma.itineraryItem.findMany({
      where: { itemDate: date },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
      include: {
        booking: {
          include: { client: true },
        },
      },
    });

    const items = rows.map(mapDailyOperationItem);

    return {
      date: query.date,
      itemCount: items.length,
      pendingCount: items.filter((i) => i.status === 'pending').length,
      activeCount: items.filter((i) => i.status === 'active').length,
      doneCount: items.filter((i) => i.status === 'done').length,
      items,
    };
  }

  async dailyOperationsWeek(query: DailyOperationsWeekQuery) {
    const start = new Date(query.start);
    const days: DailyOperationsDayDto[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const date = this.addDays(start, offset);
      const dateStr = date.toISOString().slice(0, 10);

      const rows = await this.prisma.itineraryItem.findMany({
        where: { itemDate: date },
        orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }],
        include: {
          booking: {
            include: { client: true },
          },
        },
      });

      const items = rows.map(mapDailyOperationItem);

      days.push({
        date: dateStr,
        itemCount: items.length,
        pendingCount: items.filter((i) => i.status === ItineraryItemStatus.pending)
          .length,
        activeCount: items.filter((i) => i.status === ItineraryItemStatus.active)
          .length,
        doneCount: items.filter((i) => i.status === ItineraryItemStatus.done).length,
        items,
      });
    }

    return { start: query.start, days };
  }

  private parseTime(value: string): Date {
    const normalized = value.length === 5 ? `${value}:00` : value;
    return new Date(`1970-01-01T${normalized}Z`);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (
      user.type !== 'staff' ||
      !user.role ||
      !ITINERARY_WRITE_ROLES.includes(user.role)
    ) {
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
    if (user.type === 'client' && booking.clientId !== user.sub) {
      throw AppError.forbidden();
    }
    return booking;
  }

  private async ensureItemExists(itemId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw AppError.notFound('ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found');
    }
    return item;
  }
}
