import {
  assertClientOwnsBooking,
  isBookingEligibleForClientLogin,
} from './client-auth.policy';

describe('client-auth.policy', () => {
  it('allows active and completed bookings for ZN login', () => {
    expect(isBookingEligibleForClientLogin('active')).toBe(true);
    expect(isBookingEligibleForClientLogin('completed')).toBe(true);
  });

  it('rejects cancelled bookings for ZN login', () => {
    expect(isBookingEligibleForClientLogin('cancelled')).toBe(false);
  });

  it('enforces client ownership', () => {
    expect(assertClientOwnsBooking('client-a', 'client-a')).toBe(true);
    expect(assertClientOwnsBooking('client-a', 'client-b')).toBe(false);
  });
});
