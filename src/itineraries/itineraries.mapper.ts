import {
  ItineraryItem,
  ItineraryItemStatus,
  DriverProfile,
  StaffUser,
} from '@prisma/client';

export type ItineraryItemDto = {
  id: string;
  bookingId: string;
  dayNumber: number;
  itemDate: string | null;
  startTime: string | null;
  title: string;
  description: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  vendorId: string | null;
  driverId: string | null;
  status: ItineraryItemStatus;
  sortOrder: number;
  carPlan: string | null;
  meetingPoint: string | null;
  guideContact: string | null;
  pdfUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyOperationItemDto = ItineraryItemDto & {
  znCode: string;
  clientName: string;
  driverName: string | null;
};

export type DailyOperationsDayDto = {
  date: string;
  itemCount: number;
  pendingCount: number;
  activeCount: number;
  doneCount: number;
  items: DailyOperationItemDto[];
};

function formatTime(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(11, 19);
}

export function mapItineraryItem(row: ItineraryItem): ItineraryItemDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    dayNumber: row.dayNumber,
    itemDate: row.itemDate?.toISOString().slice(0, 10) ?? null,
    startTime: formatTime(row.startTime),
    title: row.title,
    description: row.description,
    locationName: row.locationName,
    lat: row.lat,
    lng: row.lng,
    vendorId: row.vendorId,
    driverId: row.driverId,
    status: row.status,
    sortOrder: row.sortOrder,
    carPlan: row.carPlan,
    meetingPoint: row.meetingPoint,
    guideContact: row.guideContact,
    pdfUrl: row.pdfUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CustomerRequestSummaryDto = {
  kind: string;
  pax: number | null;
  checkIn: string | null;
  checkOut: string | null;
  rooms: number | null;
  roomName: string | null;
  time: string | null;
  indicativePrice: {
    amount: number;
    currency: string;
    basis: string;
  } | null;
};

export type BookingItineraryItemDto = ItineraryItemDto & {
  customerRequest: CustomerRequestSummaryDto | null;
};

function readCustomerRequest(
  extras: unknown,
): CustomerRequestSummaryDto | null {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras))
    return null;
  const e = extras as Record<string, unknown>;
  if (e.source !== 'customer_request') return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const price = e.indicativePrice as Record<string, unknown> | undefined;
  const amount = num(price?.amount);
  return {
    kind: str(e.requestedKind) ?? 'service',
    pax: num(e.pax),
    checkIn: str(e.checkIn),
    checkOut: str(e.checkOut),
    rooms: num(e.rooms),
    roomName: str(e.roomName),
    time: str(e.time),
    indicativePrice:
      amount !== null
        ? {
            amount,
            currency: str(price?.currency) ?? 'RUB',
            basis: str(price?.basis) ?? '',
          }
        : null,
  };
}

/** Booking workspace view; keeps indicative request pricing out of driver payloads. */
export function mapBookingItineraryItem(
  row: ItineraryItem,
): BookingItineraryItemDto {
  return {
    ...mapItineraryItem(row),
    customerRequest: readCustomerRequest(row.extras),
  };
}

export function mapDailyOperationItem(
  row: ItineraryItem & {
    booking: { znCode: string; client: { fullName: string } };
    driver?: (DriverProfile & { user?: StaffUser | null }) | null;
  },
): DailyOperationItemDto {
  return {
    ...mapItineraryItem(row),
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
    driverName: row.driver?.user?.fullName ?? null,
  };
}
