import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StaffRole,
  VendorBookingStatus,
  VendorType,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { decimalToNumber } from '../common/decimal.util';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import {
  AssignVendorDto,
  CreateVendorDto,
  ListVendorsQuery,
  UpdateVendorBookingDto,
  UpdateVendorDto,
} from './vendors.schema';
import {
  buildVoucherEmail,
  mapVendor,
  mapVendorBooking,
  mapVendorFinance,
  type VendorStatsDto,
} from './vendors.mapper';

const VENDOR_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const VENDOR_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const ACTIVE_BOOKING_STATUSES: VendorBookingStatus[] = [
  VendorBookingStatus.pending,
  VendorBookingStatus.confirmed,
];

const vendorBookingInclude = {
  booking: { include: { client: true } },
  vendor: true,
} satisfies Prisma.VendorBookingInclude;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async list(query: ListVendorsQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.VendorWhereInput = { deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy = parseSort(query.sort, ['name', 'createdAt', 'type'], {
      field: 'name',
      dir: 'asc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          _count: {
            select: {
              vendorBookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } },
            },
          },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data: rows.map(mapVendor), meta: pageMeta(total, page, limit) };
  }

  async stats(user: AuthPrincipal): Promise<VendorStatsDto> {
    this.assertStaffRead(user);
    const grouped = await this.prisma.vendor.groupBy({
      by: ['type'],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    });

    const counts: VendorStatsDto = {
      total: 0,
      hotel: 0,
      restaurant: 0,
      guide: 0,
      bus: 0,
      activity: 0,
      driver: 0,
      service: 0,
      b2b: 0,
    };

    for (const row of grouped) {
      counts.total += row._count._all;
      if (row.type === VendorType.hotel) counts.hotel = row._count._all;
      if (row.type === VendorType.restaurant) counts.restaurant = row._count._all;
      if (row.type === VendorType.guide) counts.guide = row._count._all;
      if (row.type === VendorType.bus) counts.bus = row._count._all;
      if (row.type === VendorType.activity) counts.activity = row._count._all;
      if (row.type === VendorType.driver) counts.driver = row._count._all;
      if (row.type === VendorType.service) counts.service = row._count._all;
      if (row.type === VendorType.b2b) counts.b2b = row._count._all;
    }

    return counts;
  }

  async getById(id: string, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const row = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            vendorBookings: { where: { status: { in: ACTIVE_BOOKING_STATUSES } } },
          },
        },
        vendorBookings: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: vendorBookingInclude,
        },
      },
    });
    if (!row) {
      throw AppError.notFound('VENDOR_NOT_FOUND', 'Vendor not found');
    }

    return {
      ...mapVendor(row),
      finance: mapVendorFinance(row, row.vendorBookings),
      bookings: row.vendorBookings.map(mapVendorBooking),
    };
  }

  async listBookings(vendorId: string, user: AuthPrincipal) {
    this.assertStaffRead(user);
    await this.findOrThrow(vendorId);
    const rows = await this.prisma.vendorBooking.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: vendorBookingInclude,
    });
    return rows.map(mapVendorBooking);
  }

  async create(dto: CreateVendorDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    const row = await this.prisma.vendor.create({
      data: {
        name: dto.name,
        type: dto.type,
        city: dto.city,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        commissionPct: dto.commissionPct ?? 0,
        paymentTerms: dto.paymentTerms,
        cancellationPolicy: dto.cancellationPolicy,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.create',
      entity: 'vendor',
      entityId: row.id,
    });

    const mapped = mapVendor(row);
    this.realtime.emit('vendor.created', mapped);
    return mapped;
  }

  async update(id: string, dto: UpdateVendorDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    await this.findOrThrow(id);

    const row = await this.prisma.vendor.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        city: dto.city,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        commissionPct: dto.commissionPct,
        paymentTerms: dto.paymentTerms,
        cancellationPolicy: dto.cancellationPolicy,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.update',
      entity: 'vendor',
      entityId: row.id,
    });

    const mapped = mapVendor(row);
    this.realtime.emit('vendor.updated', mapped);
    return mapped;
  }

  async remove(id: string, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    await this.findOrThrow(id);

    const row = await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.delete',
      entity: 'vendor',
      entityId: row.id,
    });

    const mapped = mapVendor(row);
    this.realtime.emit('vendor.deleted', mapped);
    return mapped;
  }

  async assign(vendorId: string, dto: AssignVendorDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    const vendor = await this.findOrThrow(vendorId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: { client: true },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (booking.status === 'cancelled') {
      throw AppError.validation('Cannot assign a vendor to a cancelled booking');
    }

    if (dto.itineraryItemId) {
      const item = await this.prisma.itineraryItem.findFirst({
        where: { id: dto.itineraryItemId, bookingId: dto.bookingId },
      });
      if (!item) {
        throw AppError.notFound('ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found');
      }
    }

    const amount = dto.amount ?? 0;
    const commissionAmount =
      (amount * decimalToNumber(vendor.commissionPct)) / 100;
    const serviceDate = dto.serviceDate ? new Date(dto.serviceDate) : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      let itineraryItemId = dto.itineraryItemId ?? null;

      if (!itineraryItemId && dto.appendItinerary !== false) {
        const dayNumber = this.dayNumberFromArrival(
          booking.arrivalDate,
          serviceDate ?? booking.arrivalDate,
        );
        const maxSort = await tx.itineraryItem.aggregate({
          where: { bookingId: booking.id, dayNumber },
          _max: { sortOrder: true },
        });
        const item = await tx.itineraryItem.create({
          data: {
            bookingId: booking.id,
            dayNumber,
            itemDate: serviceDate ?? booking.arrivalDate ?? undefined,
            title: vendor.name,
            description: dto.details,
            locationName: vendor.city,
            vendorId: vendor.id,
            sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          },
        });
        itineraryItemId = item.id;
      } else if (itineraryItemId) {
        await tx.itineraryItem.update({
          where: { id: itineraryItemId },
          data: { vendorId: vendor.id },
        });
      }

      return tx.vendorBooking.create({
        data: {
          vendorId,
          bookingId: dto.bookingId,
          itineraryItemId,
          amount,
          commissionAmount,
          serviceDate,
          pax: dto.pax,
          details: dto.details,
          status: VendorBookingStatus.pending,
          createdBy: user.sub,
        },
        include: vendorBookingInclude,
      });
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.assign',
      entity: 'vendor_booking',
      entityId: row.id,
      diff: { vendorId, bookingId: dto.bookingId },
    });

    const mapped = mapVendorBooking(row);
    this.realtime.emit('vendor.assigned', mapped);
    return mapped;
  }

  async updateBooking(
    vendorId: string,
    vendorBookingId: string,
    dto: UpdateVendorBookingDto,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    const existing = await this.prisma.vendorBooking.findFirst({
      where: { id: vendorBookingId, vendorId },
    });
    if (!existing) {
      throw AppError.notFound('VENDOR_BOOKING_NOT_FOUND', 'Vendor booking not found');
    }

    const vendor = await this.findOrThrow(vendorId);
    const amount = dto.amount;
    const commissionAmount =
      amount == null
        ? undefined
        : (amount * decimalToNumber(vendor.commissionPct)) / 100;

    const row = await this.prisma.vendorBooking.update({
      where: { id: vendorBookingId },
      data: {
        status: dto.status,
        amount,
        commissionAmount,
        pax: dto.pax,
        details: dto.details,
        serviceDate: dto.serviceDate ? new Date(dto.serviceDate) : undefined,
      },
      include: vendorBookingInclude,
    });

    const mapped = mapVendorBooking(row);
    this.realtime.emit('vendor.booking.updated', mapped);
    return mapped;
  }

  async generateVoucher(
    vendorId: string,
    vendorBookingId: string,
    user: AuthPrincipal,
  ) {
    this.assertStaffWrite(user);
    const row = await this.prisma.vendorBooking.findFirst({
      where: { id: vendorBookingId, vendorId },
      include: vendorBookingInclude,
    });
    if (!row || !row.vendor || !row.booking) {
      throw AppError.notFound('VENDOR_BOOKING_NOT_FOUND', 'Vendor booking not found');
    }

    const voucherCode =
      row.voucherCode ??
      this.makeVoucherCode(row.vendor.type, row.booking.znCode);

    const updated = await this.prisma.vendorBooking.update({
      where: { id: row.id },
      data: {
        voucherCode,
        voucherSentAt: new Date(),
        status:
          row.status === VendorBookingStatus.pending
            ? VendorBookingStatus.confirmed
            : row.status,
      },
      include: vendorBookingInclude,
    });

    const email = buildVoucherEmail({
      vendorName: row.vendor.name,
      vendorEmail: row.vendor.email,
      contactName: row.vendor.contactName,
      znCode: row.booking.znCode,
      clientName: row.booking.client?.fullName ?? '',
      serviceDate: updated.serviceDate?.toISOString().slice(0, 10) ?? null,
      pax: updated.pax,
      details: updated.details,
      voucherCode,
      type: row.vendor.type,
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.voucher',
      entity: 'vendor_booking',
      entityId: row.id,
      diff: { voucherCode },
    });

    this.realtime.emit('vendor.booking.updated', mapVendorBooking(updated));

    return {
      vendorBookingId: updated.id,
      voucherCode,
      vendorName: row.vendor.name,
      vendorEmail: row.vendor.email,
      znCode: row.booking.znCode,
      clientName: row.booking.client?.fullName ?? '',
      serviceDate: updated.serviceDate?.toISOString().slice(0, 10) ?? null,
      pax: updated.pax,
      details: updated.details,
      email,
    };
  }

  async finance(vendorId: string, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const vendor = await this.findOrThrow(vendorId);
    const bookings = await this.prisma.vendorBooking.findMany({
      where: { vendorId },
      include: { vendor: true },
    });
    return mapVendorFinance(vendor, bookings);
  }

  private dayNumberFromArrival(
    arrival: Date | null,
    service: Date | null | undefined,
  ) {
    if (!arrival || !service) return 1;
    const a = Date.UTC(
      arrival.getUTCFullYear(),
      arrival.getUTCMonth(),
      arrival.getUTCDate(),
    );
    const s = Date.UTC(
      service.getUTCFullYear(),
      service.getUTCMonth(),
      service.getUTCDate(),
    );
    return Math.max(1, Math.floor((s - a) / 86_400_000) + 1);
  }

  private makeVoucherCode(type: string, znCode: string) {
    const prefix = type.slice(0, 3).toUpperCase();
    const rand = randomBytes(2).toString('hex').toUpperCase();
    return `ZV-${prefix}-${znCode}-${rand}`;
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw AppError.notFound('VENDOR_NOT_FOUND', 'Vendor not found');
    }
    return row;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !VENDOR_READ_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !VENDOR_WRITE_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
