import { Vendor, VendorBooking } from '@prisma/client';
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
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

type VendorBookingRow = VendorBooking & { vendor?: Vendor | null };

export function mapVendor(row: Vendor): VendorDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    commissionPct: decimalToNumber(row.commissionPct),
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
