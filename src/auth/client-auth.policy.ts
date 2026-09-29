import { BookingStatus } from '@prisma/client';

/**
 * Pure helpers mirroring AuthService booking-status rules for client ZN login.
 * Kept separate so ownership/auth policy can be unit-tested without Nest DI.
 */
export function isBookingEligibleForClientLogin(
  status: BookingStatus | string,
): boolean {
  return status === 'active' || status === 'completed';
}

export function assertClientOwnsBooking(
  bookingClientId: string,
  authClientId: string,
): boolean {
  return bookingClientId === authClientId;
}
