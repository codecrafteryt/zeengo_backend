import {
  Booking,
  Client,
  DriverAssignment,
  DriverProfile,
  Package,
  StaffUser,
  Vendor,
  VendorBooking,
} from '@prisma/client';
import { decimalToNumber } from '../common/decimal.util';

export type VipClientDto = {
  bookingId: string;
  znCode: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  packageName: string | null;
  hotelName: string | null;
  specialNotes: string | null;
  isVip: boolean;
  isAssigned: boolean;
  driverName: string | null;
  vipActivatedAt: string | null;
  totalAmount: number;
  status: string;
  arrivalDate: string | null;
  departureDate: string | null;
  preferredLang: string | null;
};

export type VipCandidateDto = {
  bookingId: string;
  znCode: string;
  clientName: string;
  packageName: string | null;
  totalAmount: number;
};

export type VipOpsManagerDto = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string;
};

export type VipOverviewDto = {
  totalVipBookings: number;
  pendingUpgradeRequests: number;
  vipRevenue: number;
  vipPrice: number;
  hotline: string;
  slaMinutes: number;
  inclusions: string[];
  opsManagers: VipOpsManagerDto[];
};

export type VipEscalateResultDto = {
  bookingId: string;
  znCode: string;
  taskId: string | null;
  conversationId: string | null;
  notified: boolean;
};

type DriverAssignmentRow = DriverAssignment & {
  driver?:
    | (DriverProfile & {
        user?: StaffUser | null;
      })
    | null;
};

type VendorBookingRow = VendorBooking & {
  vendor?: Vendor | null;
};

type VipBookingRow = Booking & {
  client?: Client | null;
  package?: Package | null;
  driverAssignments?: DriverAssignmentRow[];
  vendorBookings?: VendorBookingRow[];
};

function isoDate(value?: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function resolveHotel(row: VipBookingRow): string | null {
  const hotel = row.vendorBookings?.find((vb) => vb.vendor?.type === 'hotel');
  return hotel?.vendor?.name ?? null;
}

function resolveDriver(row: VipBookingRow): {
  isAssigned: boolean;
  driverName: string | null;
} {
  const active = row.driverAssignments?.find((a) => a.status === 'active');
  const name = active?.driver?.user?.fullName ?? null;
  return { isAssigned: Boolean(active), driverName: name };
}

export function mapVipClient(row: VipBookingRow): VipClientDto {
  const { isAssigned, driverName } = resolveDriver(row);
  return {
    bookingId: row.id,
    znCode: row.znCode,
    clientId: row.clientId,
    clientName: row.client?.fullName ?? '',
    clientPhone: row.client?.phone ?? null,
    packageName: row.package?.name ?? null,
    hotelName: resolveHotel(row),
    specialNotes: row.internalNotes?.trim() || null,
    isVip: row.isVip,
    isAssigned,
    driverName,
    vipActivatedAt: row.vipActivatedAt?.toISOString() ?? null,
    totalAmount: decimalToNumber(row.totalAmount),
    status: row.status,
    arrivalDate: isoDate(row.arrivalDate),
    departureDate: isoDate(row.departureDate),
    preferredLang: row.client?.preferredLang ?? null,
  };
}

export function mapVipCandidate(
  row: Booking & { client?: Client | null; package?: Package | null },
): VipCandidateDto {
  return {
    bookingId: row.id,
    znCode: row.znCode,
    clientName: row.client?.fullName ?? '',
    packageName: row.package?.name ?? null,
    totalAmount: decimalToNumber(row.totalAmount),
  };
}

export const VIP_INCLUSIONS = [
  '24/7 Personal Concierge',
  'Priority Driver Assignment',
  'Halal Dining & Table Reservations',
  'Event & Ticket Booking',
  'Live Translation Support',
  'Personal Shopping Assistance',
  'Medical Emergency Coordination',
  'Airport Fast-Track Meet & Greet',
] as const;

export const VIP_HOTLINE = '+7 (916) VIP-LINE';
export const VIP_SLA_MINUTES = 5;
