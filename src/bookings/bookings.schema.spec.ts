import {
  createCustomerBookingRequestSchema,
  reviewCustomerBookingSchema,
} from './bookings.schema';

describe('customer booking request schemas (Option A)', () => {
  it('accepts a valid customer web request', () => {
    const parsed = createCustomerBookingRequestSchema.parse({
      client: { fullName: 'Aisha', phone: '+79990001122', email: 'a@x.com' },
      partySize: 2,
      childrenCount: 1,
      arrivalDate: '2026-10-10',
      departureDate: '2026-10-15',
      idempotencyKey: 'web-test-key-12345',
      source: 'customer_web',
      requestedItems: [
        {
          kind: 'hotel',
          title: 'Ritz Moscow',
          vendorId: '890647f1-ebf0-47e4-a04e-2ab8bf16e48f',
        },
      ],
    });
    expect(parsed.source).toBe('customer_web');
    expect(parsed.requestedItems).toHaveLength(1);
    expect(parsed.childrenCount).toBe(1);
  });

  it('rejects short idempotency keys', () => {
    expect(() =>
      createCustomerBookingRequestSchema.parse({
        client: { fullName: 'A', phone: '+1' },
        partySize: 1,
        arrivalDate: '2026-10-10',
        departureDate: '2026-10-11',
        idempotencyKey: 'short',
      }),
    ).toThrow();
  });

  it('rejects invalid requested kind', () => {
    expect(() =>
      createCustomerBookingRequestSchema.parse({
        client: { fullName: 'A', phone: '+1' },
        partySize: 1,
        arrivalDate: '2026-10-10',
        departureDate: '2026-10-11',
        idempotencyKey: 'web-test-key-12345',
        requestedItems: [{ kind: 'driver_assign', title: 'Nope' }],
      }),
    ).toThrow();
  });

  it('allows under_review / confirmed / rejected review states only', () => {
    expect(
      reviewCustomerBookingSchema.parse({ requestStatus: 'under_review' })
        .requestStatus,
    ).toBe('under_review');
    expect(
      reviewCustomerBookingSchema.parse({ requestStatus: 'confirmed' })
        .requestStatus,
    ).toBe('confirmed');
    expect(
      reviewCustomerBookingSchema.parse({
        requestStatus: 'rejected',
        rejectionReason: 'Sold out',
      }).requestStatus,
    ).toBe('rejected');
    expect(() =>
      reviewCustomerBookingSchema.parse({ requestStatus: 'pending' }),
    ).toThrow();
  });
});
