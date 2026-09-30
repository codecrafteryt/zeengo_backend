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

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^00/, '');
}

/**
 * ZN codes are sequential, so a booking code alone is not a secret.
 * The caller must also prove the phone on the booking. Formats differ
 * (+971…, 00971…, local 05…), so compare the last 9 digits when both
 * numbers are long enough, otherwise require an exact digit match.
 */
export function phoneMatchesClient(
  provided: string | null | undefined,
  clientPhone: string | null | undefined,
): boolean {
  if (!provided || !clientPhone) return false;
  const a = phoneDigits(provided);
  const b = phoneDigits(clientPhone);
  if (a.length < 7 || b.length < 7) return false;
  if (a.length >= 9 && b.length >= 9) return a.slice(-9) === b.slice(-9);
  return a === b;
}

/**
 * A client session is bound to the booking it logged in with (JWT bookingId).
 * Other bookings on the same client record stay hidden, because anyone who
 * knows a phone number can create a new booking for it.
 */
export function clientMayAccessBooking(
  booking: { id: string; clientId: string },
  user: { type: string; sub: string; bookingId?: string },
): boolean {
  if (user.type !== 'client') return true;
  if (booking.clientId !== user.sub) return false;
  return !user.bookingId || booking.id === user.bookingId;
}

export function assertClientOwnsBooking(
  bookingClientId: string,
  authClientId: string,
): boolean {
  return bookingClientId === authClientId;
}
