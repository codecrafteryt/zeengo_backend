import { Booking, EditRequest, StaffUser } from '@prisma/client';

export type EditRequestDto = {
  id: string;
  bookingId: string;
  znCode: string | null;
  type: string;
  originalValue: string | null;
  requestedValue: string | null;
  reason: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type EditRequestRow = EditRequest & {
  booking?: Booking | null;
  reviewedByUser?: StaffUser | null;
};

export function mapEditRequest(row: EditRequestRow): EditRequestDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? null,
    type: row.type,
    originalValue: row.originalValue,
    requestedValue: row.requestedValue,
    reason: row.reason,
    status: row.status,
    reviewNotes: row.reviewNotes,
    reviewedBy: row.reviewedBy,
    reviewedByName: row.reviewedByUser?.fullName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
