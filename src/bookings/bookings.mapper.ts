import {
  Booking,
  BookingNote,
  BookingStatus,
  ChecklistItem,
  Client,
  DriverAssignment,
  DriverProfile,
  Package,
  Payment,
  PaymentMethod,
  PaymentStatus,
  StaffUser,
} from '@prisma/client';
import { decimalToNumber } from '../common/decimal.util';

export type ClientSummaryDto = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationality: string | null;
};

export type PackageSummaryDto = {
  id: string;
  name: string;
  slug: string;
};

export type DriverAssignmentDto = {
  id: string;
  driverId: string;
  driverName: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
};

export type BookingDto = {
  id: string;
  znCode: string;
  clientId: string;
  packageId: string;
  arrivalDate: string | null;
  departureDate: string | null;
  partySize: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: BookingStatus;
  isVip: boolean;
  internalNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  client?: ClientSummaryDto;
  package?: PackageSummaryDto;
  activeDriverAssignment?: DriverAssignmentDto | null;
};

export type BookingCodeDto = {
  id: string;
  znCode: string;
  clientName: string;
  status: BookingStatus;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  arrivalDate: string | null;
};

export type ChecklistItemDto = {
  id: string;
  bookingId: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
};

export type BookingNoteDto = {
  id: string;
  bookingId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type PaymentDto = {
  id: string;
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  location: string | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
};

type BookingWithRelations = Booking & {
  client?: Client;
  package?: Package;
  driverAssignments?: Array<
    DriverAssignment & {
      driver?: DriverProfile & { user?: StaffUser };
    }
  >;
};

function mapClientSummary(client: Client): ClientSummaryDto {
  return {
    id: client.id,
    fullName: client.fullName,
    phone: client.phone,
    email: client.email,
    nationality: client.nationality,
  };
}

function mapPackageSummary(pkg: Package): PackageSummaryDto {
  return {
    id: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
  };
}

function mapActiveDriverAssignment(
  assignments: BookingWithRelations['driverAssignments'],
): DriverAssignmentDto | null {
  const active = assignments?.find((a) => a.status === 'active');
  if (!active) return null;

  return {
    id: active.id,
    driverId: active.driverId,
    driverName: active.driver?.user?.fullName ?? null,
    startDate: active.startDate.toISOString().slice(0, 10),
    endDate: active.endDate?.toISOString().slice(0, 10) ?? null,
    status: active.status,
  };
}

export function mapBooking(
  row: BookingWithRelations,
  paidAmount: number,
): BookingDto {
  const totalAmount = decimalToNumber(row.totalAmount);

  return {
    id: row.id,
    znCode: row.znCode,
    clientId: row.clientId,
    packageId: row.packageId,
    arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
    departureDate: row.departureDate?.toISOString().slice(0, 10) ?? null,
    partySize: row.partySize,
    totalAmount,
    paidAmount,
    dueAmount: Math.max(0, totalAmount - paidAmount),
    status: row.status,
    isVip: row.isVip,
    internalNotes: row.internalNotes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.client ? { client: mapClientSummary(row.client) } : {}),
    ...(row.package ? { package: mapPackageSummary(row.package) } : {}),
    ...(row.driverAssignments
      ? {
          activeDriverAssignment: mapActiveDriverAssignment(
            row.driverAssignments,
          ),
        }
      : {}),
  };
}

export function mapBookingCode(
  row: Booking & { client?: Client },
  paidAmount: number,
): BookingCodeDto {
  const totalAmount = decimalToNumber(row.totalAmount);

  return {
    id: row.id,
    znCode: row.znCode,
    clientName: row.client?.fullName ?? '',
    status: row.status,
    totalAmount,
    paidAmount,
    dueAmount: Math.max(0, totalAmount - paidAmount),
    arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
  };
}

export function mapChecklistItem(row: ChecklistItem): ChecklistItemDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    title: row.title,
    isDone: row.isDone,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapBookingNote(
  row: BookingNote & { author?: StaffUser },
): BookingNoteDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    authorId: row.authorId,
    authorName: row.author?.fullName ?? null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPayment(row: Payment): PaymentDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    amount: decimalToNumber(row.amount),
    method: row.method,
    status: row.status,
    location: row.location,
    notes: row.notes,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
