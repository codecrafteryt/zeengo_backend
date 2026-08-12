import { Booking, Client, DriverProfile, DriverReview, StaffUser } from '@prisma/client';

type ReviewRow = DriverReview & {
  booking: Pick<Booking, 'znCode'>;
  client: Pick<Client, 'fullName'>;
  driver: DriverProfile & { user: Pick<StaffUser, 'fullName'> };
};

export type DriverReviewDto = {
  id: string;
  bookingId: string;
  znCode: string;
  clientId: string;
  clientName: string;
  driverId: string;
  driverName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverReviewsStatsDto = {
  driverId: string | null;
  average: number;
  reviewsCount: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

export function mapDriverReview(row: ReviewRow): DriverReviewDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking.znCode,
    clientId: row.clientId,
    clientName: row.client.fullName,
    driverId: row.driverId,
    driverName: row.driver.user.fullName,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
