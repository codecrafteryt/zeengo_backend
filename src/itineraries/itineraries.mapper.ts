import { ItineraryItem, ItineraryItemStatus, DriverProfile, StaffUser } from '@prisma/client';

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
