import { Booking, Client, SosAlert, StaffUser } from '@prisma/client';

export type SosAlertDto = {
  id: string;
  bookingId: string;
  znCode: string | null;
  clientName: string | null;
  clientPhone: string | null;
  message: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type SosRow = SosAlert & {
  booking?:
    | (Booking & {
        client?: Client | null;
      })
    | null;
  resolvedByUser?: StaffUser | null;
};

export function mapSosAlert(row: SosRow): SosAlertDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? null,
    clientName: row.booking?.client?.fullName ?? null,
    clientPhone: row.booking?.client?.phone ?? null,
    message: row.message,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    resolvedBy: row.resolvedBy,
    resolvedByName: row.resolvedByUser?.fullName ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
