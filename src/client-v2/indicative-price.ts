/**
 * Indicative ("from") prices shown on the website. These are estimates from
 * the rate cards in the catalog; ZEEN confirms the final price on the booking,
 * so nothing here is ever written to Booking.totalAmount or a Payment.
 */

export type TransferService = 'airport' | 'hourly' | 'day';

export interface IndicativePrice {
  amount: number;
  currency: string;
  /** Human-readable basis, e.g. "3 nights × 4,500 RUB". */
  basis: string;
  indicative: true;
}

type Num = number | { toString(): string } | null | undefined;

export function toAmount(value: Num): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function price(
  amount: number,
  currency: string,
  basis: string,
): IndicativePrice {
  return { amount: Math.round(amount), currency, basis, indicative: true };
}

export function transferPrice(
  vc: {
    rateAirport: Num;
    rateHourly: Num;
    rateDay8: Num;
    rateCurrency: string;
  },
  service: TransferService,
  hours = 1,
): IndicativePrice | null {
  const currency = vc.rateCurrency;
  if (service === 'airport') {
    const rate = toAmount(vc.rateAirport);
    return rate ? price(rate, currency, 'Airport transfer, one way') : null;
  }
  if (service === 'day') {
    const rate = toAmount(vc.rateDay8);
    return rate ? price(rate, currency, 'Full day with driver (8 h)') : null;
  }
  const rate = toAmount(vc.rateHourly);
  const h = Math.max(1, Math.floor(hours));
  return rate
    ? price(rate * h, currency, `${h} h × ${fmt(rate)} ${currency}`)
    : null;
}

export function unitPrice(
  rate: Num,
  currency: string,
  unit: string | null | undefined,
  qty: { nights?: number; hours?: number; pax?: number; rooms?: number },
): IndicativePrice | null {
  const r = toAmount(rate);
  if (!r) return null;
  switch (unit) {
    case 'night': {
      const nights = Math.max(1, qty.nights ?? 1);
      const rooms = Math.max(1, qty.rooms ?? 1);
      const roomsLabel = rooms > 1 ? ` × ${rooms} rooms` : '';
      return price(
        r * nights * rooms,
        currency,
        `${nights} night${nights > 1 ? 's' : ''}${roomsLabel} × ${fmt(r)} ${currency}`,
      );
    }
    case 'person': {
      const pax = Math.max(1, qty.pax ?? 1);
      return price(
        r * pax,
        currency,
        `${pax} guest${pax > 1 ? 's' : ''} × ${fmt(r)} ${currency}`,
      );
    }
    case 'hour': {
      const h = Math.max(1, qty.hours ?? 1);
      return price(r * h, currency, `${h} h × ${fmt(r)} ${currency}`);
    }
    default:
      return price(r, currency, `From ${fmt(r)} ${currency}`);
  }
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000)) : 1;
}
