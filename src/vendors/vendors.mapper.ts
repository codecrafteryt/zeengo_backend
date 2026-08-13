import {
  Booking,
  Client,
  Vendor,
  VendorBooking,
  VendorBookingStatus,
} from '@prisma/client';
import { decimalToNumber } from '../common/decimal.util';

export type VendorDto = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  commissionPct: number;
  paymentTerms: string | null;
  cancellationPolicy: string | null;
  notes: string | null;
  isActive: boolean;
  activeBookingsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type VendorBookingDto = {
  id: string;
  vendorId: string;
  bookingId: string;
  znCode: string;
  clientName: string;
  itineraryItemId: string | null;
  amount: number | null;
  commissionAmount: number | null;
  serviceDate: string | null;
  pax: number | null;
  details: string | null;
  voucherCode: string | null;
  voucherSentAt: string | null;
  status: VendorBookingStatus;
  createdAt: string;
};

export type VendorFinanceDto = {
  vendorId: string;
  vendorName: string;
  totalBookings: number;
  totalAmount: number;
  totalCommission: number;
  pendingAmount: number;
  completedAmount: number;
};

export type VendorStatsDto = {
  total: number;
  hotel: number;
  restaurant: number;
  guide: number;
  bus: number;
  activity: number;
  driver: number;
};

export type VendorVoucherDto = {
  vendorBookingId: string;
  voucherCode: string;
  vendorName: string;
  vendorEmail: string | null;
  znCode: string;
  clientName: string;
  serviceDate: string | null;
  pax: number | null;
  details: string | null;
  email: { to: string | null; subject: string; body: string };
};

type VendorWithCount = Vendor & {
  _count?: { vendorBookings?: number };
};

type VendorBookingRow = VendorBooking & {
  vendor?: Vendor | null;
  booking?: (Booking & { client?: Client | null }) | null;
};

export function mapVendor(row: VendorWithCount): VendorDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    commissionPct: decimalToNumber(row.commissionPct),
    paymentTerms: row.paymentTerms,
    cancellationPolicy: row.cancellationPolicy,
    notes: row.notes,
    isActive: row.isActive,
    activeBookingsCount: row._count?.vendorBookings ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapVendorBooking(row: VendorBookingRow): VendorBookingDto {
  return {
    id: row.id,
    vendorId: row.vendorId,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? '',
    clientName: row.booking?.client?.fullName ?? '',
    itineraryItemId: row.itineraryItemId,
    amount: row.amount == null ? null : decimalToNumber(row.amount),
    commissionAmount:
      row.commissionAmount == null ? null : decimalToNumber(row.commissionAmount),
    serviceDate: row.serviceDate?.toISOString().slice(0, 10) ?? null,
    pax: row.pax,
    details: row.details,
    voucherCode: row.voucherCode,
    voucherSentAt: row.voucherSentAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapVendorFinance(
  vendor: Vendor,
  bookings: VendorBookingRow[],
): VendorFinanceDto {
  let totalAmount = 0;
  let totalCommission = 0;
  let pendingAmount = 0;
  let completedAmount = 0;

  for (const b of bookings) {
    const amt = decimalToNumber(b.amount);
    const comm = decimalToNumber(b.commissionAmount);
    totalAmount += amt;
    totalCommission += comm;
    if (b.status === 'pending' || b.status === 'confirmed') {
      pendingAmount += amt;
    } else if (b.status === 'completed') {
      completedAmount += amt;
    }
  }

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    totalBookings: bookings.length,
    totalAmount,
    totalCommission,
    pendingAmount,
    completedAmount,
  };
}

export function buildVoucherEmail(params: {
  vendorName: string;
  vendorEmail: string | null;
  contactName: string | null;
  znCode: string;
  clientName: string;
  serviceDate: string | null;
  pax: number | null;
  details: string | null;
  voucherCode: string;
  type: string;
}): { to: string | null; subject: string; body: string } {
  const dateLine = params.serviceDate ?? 'TBD';
  const paxLine = params.pax != null ? String(params.pax) : 'TBD';
  const extra = params.details ? `\nDetails / Детали: ${params.details}` : '';
  const greeting = params.contactName ? `Dear ${params.contactName}` : 'Dear partners';

  return {
    to: params.vendorEmail,
    subject: `Zeengo reservation ${params.znCode} — ${params.vendorName} [${params.voucherCode}]`,
    body: `${greeting},

Please confirm the following Zeengo reservation / Просьба подтвердить бронирование Zeengo:

Voucher: ${params.voucherCode}
Client / Клиент: ${params.clientName} (${params.znCode})
Service: ${params.type}
Date / Дата: ${dateLine}
Pax / Гостей: ${paxLine}${extra}

Kindly reply with confirmation.
С уважением,
Zeengo Ops
`,
  };
}
