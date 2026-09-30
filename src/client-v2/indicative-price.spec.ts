import { nightsBetween, transferPrice, unitPrice } from './indicative-price';

describe('indicative prices', () => {
  const vc = {
    rateAirport: 3200,
    rateHourly: 1900,
    rateDay8: 12900,
    rateCurrency: 'RUB',
  };

  it('prices transfers by service', () => {
    expect(transferPrice(vc, 'airport')?.amount).toBe(3200);
    expect(transferPrice(vc, 'hourly', 4)?.amount).toBe(7600);
    expect(transferPrice(vc, 'day')?.amount).toBe(12900);
    expect(transferPrice({ ...vc, rateHourly: null }, 'hourly', 2)).toBeNull();
  });

  it('prices stays per night and room', () => {
    const p = unitPrice(4500, 'RUB', 'night', { nights: 3, rooms: 2 });
    expect(p).toMatchObject({ amount: 27000, indicative: true });
    expect(p?.basis).toContain('3 nights × 2 rooms');
  });

  it('prices per person and ignores missing rates', () => {
    expect(unitPrice(3900, 'RUB', 'person', { pax: 2 })?.amount).toBe(7800);
    expect(unitPrice(null, 'RUB', 'person', { pax: 2 })).toBeNull();
    expect(unitPrice(0, 'RUB', 'night', {})).toBeNull();
  });

  it('counts nights between dates', () => {
    expect(nightsBetween('2026-10-10', '2026-10-13')).toBe(3);
    expect(nightsBetween('2026-10-10', '2026-10-10')).toBe(1);
  });
});
