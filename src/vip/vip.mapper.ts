import { Booking, Client } from '@prisma/client';

export type VipClientDto = {
  bookingId: string;
  znCode: string;
  clientId: string;
  clientName: string;
  isVip: boolean;
  vipActivatedAt: string | null;
  totalAmount: number;
};

export type VipOverviewDto = {
  totalVipBookings: number;
  pendingUpgradeRequests: number;
  vipRevenue: number;
};

type VipBookingRow = Booking & { client?: Client | null };

export function mapVipClient(row: VipBookingRow): VipClientDto {
  return {
    bookingId: row.id,
    znCode: row.znCode,
    clientId: row.clientId,
    clientName: row.client?.fullName ?? '',
    isVip: row.isVip,
    vipActivatedAt: row.vipActivatedAt?.toISOString() ?? null,
    totalAmount: Number(row.totalAmount),
  };
}
