import { Booking, Client } from '@prisma/client';
import { decimalToNumber } from '../common/decimal.util';

export type ClientBookingSummary = {
  id: string;
  znCode: string;
  status: string;
  arrivalDate: string | null;
  departureDate: string | null;
  totalAmount: number;
};

export type ClientDto = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationality: string | null;
  whatsapp: string | null;
  preferredLang: string;
  createdAt: string;
  updatedAt: string;
  recentBookings?: ClientBookingSummary[];
};

function mapBookingSummary(row: Booking): ClientBookingSummary {
  return {
    id: row.id,
    znCode: row.znCode,
    status: row.status,
    arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) ?? null,
    departureDate: row.departureDate?.toISOString().slice(0, 10) ?? null,
    totalAmount: decimalToNumber(row.totalAmount),
  };
}

export function mapClient(
  row: Client,
  recentBookings?: Booking[],
): ClientDto {
  const dto: ClientDto = {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    nationality: row.nationality,
    whatsapp: row.whatsapp,
    preferredLang: row.preferredLang,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (recentBookings) {
    dto.recentBookings = recentBookings.map(mapBookingSummary);
  }

  return dto;
}
