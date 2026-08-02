import { Injectable } from '@nestjs/common';
import { Prisma, StaffRole, VendorBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
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
  UpdateVendorDto,
} from './vendors.schema';
import { mapVendor, mapVendorFinance } from './vendors.mapper';

const VENDOR_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const VENDOR_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
];

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListVendorsQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.VendorWhereInput = { deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.city) where.city = query.city;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const orderBy = parseSort(query.sort, ['name', 'createdAt', 'type'], {
      field: 'name',
      dir: 'asc',
    });

    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, orderBy, skip, take }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data: rows.map(mapVendor), meta: pageMeta(total, page, limit) };
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

    return mapVendor(row);
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
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });

    return mapVendor(row);
  }

  async remove(id: string, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    await this.findOrThrow(id);

    const row = await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return mapVendor(row);
  }

  async assign(vendorId: string, dto: AssignVendorDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    const vendor = await this.findOrThrow(vendorId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
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

    const row = await this.prisma.vendorBooking.create({
      data: {
        vendorId,
        bookingId: dto.bookingId,
        itineraryItemId: dto.itineraryItemId,
        amount,
        commissionAmount,
        status: VendorBookingStatus.pending,
        createdBy: user.sub,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'vendor.assign',
      entity: 'vendor_booking',
      entityId: row.id,
      diff: { vendorId, bookingId: dto.bookingId },
    });

    return row;
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
