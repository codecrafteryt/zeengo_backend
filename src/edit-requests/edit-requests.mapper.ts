import { Booking, Client, EditRequest, StaffUser } from '@prisma/client';

export type EditRequestDto = {
  id: string;
  bookingId: string;
  znCode: string | null;
  clientName: string | null;
  clientPhone: string | null;
  type: string;
  originalValue: string | null;
  requestedValue: string | null;
  reason: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** Affected itinerary window from the booking (ISO date YYYY-MM-DD). */
  targetDate: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  createdAt: string;
};

type EditRequestRow = EditRequest & {
  booking?:
    | (Booking & {
        client?: Client | null;
      })
    | null;
  reviewedByUser?: StaffUser | null;
};

function isoDate(value?: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function mapEditRequest(row: EditRequestRow): EditRequestDto {
  const arrival = isoDate(row.booking?.arrivalDate ?? null);
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? null,
    clientName: row.booking?.client?.fullName ?? null,
    clientPhone: row.booking?.client?.phone ?? null,
    type: row.type,
    originalValue: row.originalValue,
    requestedValue: row.requestedValue,
    reason: row.reason,
    status: row.status,
    reviewNotes: row.reviewNotes,
    reviewedBy: row.reviewedBy,
    reviewedByName: row.reviewedByUser?.fullName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    targetDate: arrival,
    arrivalDate: arrival,
    departureDate: isoDate(row.booking?.departureDate ?? null),
    createdAt: row.createdAt.toISOString(),
  };
}
