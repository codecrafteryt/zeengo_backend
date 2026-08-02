import { Payment, PaymentMethod, PaymentStatus, StaffUser } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { decimalToNumber } from '../common/decimal.util';

export type PaymentDto = {
  id: string;
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  location: string | null;
  notes: string | null;
  collectedBy: string | null;
  collectedByName: string | null;
  stripePaymentLinkId: string | null;
  stripeSessionId: string | null;
  stripeLinkUrl: string | null;
  linkExpiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SplizerClientDto = {
  id: string;
  znCode: string;
  clientName: string;
  clientPhone: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  arrivalDate: string | null;
};

export type PaymentHistoryItemDto = PaymentDto & {
  znCode: string;
  clientName: string;
};

type PaymentWithCollector = Payment & {
  collectedByUser?: StaffUser | null;
};

export function mapPayment(row: PaymentWithCollector): PaymentDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    amount: decimalToNumber(row.amount),
    method: row.method,
    status: row.status,
    location: row.location,
    notes: row.notes,
    collectedBy: row.collectedBy,
    collectedByName: row.collectedByUser?.fullName ?? null,
    stripePaymentLinkId: row.stripePaymentLinkId,
    stripeSessionId: row.stripeSessionId,
    stripeLinkUrl: row.stripeLinkUrl,
    linkExpiresAt: row.linkExpiresAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapPaymentHistoryItem(
  row: PaymentWithCollector & {
    booking: { znCode: string; client: { fullName: string } };
  },
): PaymentHistoryItemDto {
  return {
    ...mapPayment(row),
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
  };
}

export function mapSplizerClient(row: {
  id: string;
  znCode: string;
  status: string;
  totalAmount: Decimal;
  arrivalDate: Date | null;
  client: { fullName: string; phone: string };
  paidAmount: number;
}): SplizerClientDto {
  const totalAmount = decimalToNumber(row.totalAmount);
  return {
    id: row.id,
    znCode: row.znCode,
    clientName: row.client.fullName,
    clientPhone: row.client.phone,
    status: row.status,
    totalAmount,
    paidAmount: row.paidAmount,
    dueAmount: Math.max(0, totalAmount - row.paidAmount),
    arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
  };
}
