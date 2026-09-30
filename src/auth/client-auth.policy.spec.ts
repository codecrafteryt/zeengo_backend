import {
  assertClientOwnsBooking,
  clientMayAccessBooking,
  isBookingEligibleForClientLogin,
  phoneMatchesClient,
} from './client-auth.policy';

describe('client-auth.policy', () => {
  it('allows active and completed bookings for ZN login', () => {
    expect(isBookingEligibleForClientLogin('active')).toBe(true);
    expect(isBookingEligibleForClientLogin('completed')).toBe(true);
  });

  it('rejects cancelled bookings for ZN login', () => {
    expect(isBookingEligibleForClientLogin('cancelled')).toBe(false);
  });

  it('matches the same phone across formats', () => {
    expect(phoneMatchesClient('+971 50 179 7683', '00971501797683')).toBe(true);
    expect(phoneMatchesClient('0501797683', '+971501797683')).toBe(true);
    expect(phoneMatchesClient('+7 (936) 132-31-17', '79361323117')).toBe(true);
  });

  it('rejects a different, missing or too-short phone', () => {
    expect(phoneMatchesClient('+971501797684', '+971501797683')).toBe(false);
    expect(phoneMatchesClient(undefined, '+971501797683')).toBe(false);
    expect(phoneMatchesClient('', '+971501797683')).toBe(false);
    expect(phoneMatchesClient('7683', '+971501797683')).toBe(false);
  });

  it('limits a ZN session to its bound booking', () => {
    const client = { type: 'client', sub: 'c1', bookingId: 'b1' };
    expect(clientMayAccessBooking({ id: 'b1', clientId: 'c1' }, client)).toBe(true);
    expect(clientMayAccessBooking({ id: 'b2', clientId: 'c1' }, client)).toBe(false);
    expect(clientMayAccessBooking({ id: 'b1', clientId: 'c2' }, client)).toBe(false);
    expect(
      clientMayAccessBooking({ id: 'b2', clientId: 'c1' }, { type: 'client', sub: 'c1' }),
    ).toBe(true);
    expect(
      clientMayAccessBooking({ id: 'b9', clientId: 'c9' }, { type: 'staff', sub: 's1' }),
    ).toBe(true);
  });

  it('enforces client ownership', () => {
    expect(assertClientOwnsBooking('client-a', 'client-a')).toBe(true);
    expect(assertClientOwnsBooking('client-a', 'client-b')).toBe(false);
  });
});
