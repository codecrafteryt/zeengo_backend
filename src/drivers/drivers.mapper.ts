import {
  Booking,
  Client,
  DriverAssignment,
  DriverProfile,
  ItineraryItem,
  StaffUser,
} from '@prisma/client';
import { mapDriverProfile } from '../users/users.mapper';
import { mapItineraryItem } from '../itineraries/itineraries.mapper';

export type DriverUserSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
};

export type DriverActiveAssignmentSummary = {
  id: string;
  bookingId: string;
  znCode: string | null;
  clientName: string | null;
  clientPhone: string | null;
  startDate: string;
  endDate: string | null;
};

export type DriverListItemDto = ReturnType<typeof mapDriverProfile> & {
  user: DriverUserSummary;
  activeAssignment: DriverActiveAssignmentSummary | null;
};

export type UnassignedBookingDto = {
  bookingId: string;
  znCode: string;
  clientName: string;
  clientPhone: string | null;
  packageName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  isVip: boolean;
};

export type DriverStatsDto = {
  total: number;
  available: number;
  enRoute: number;
  resting: number;
  offDuty: number;
  unassignedBookings: number;
};

export type DriverAssignmentDto = {
  id: string;
  bookingId: string;
  znCode: string | null;
  clientName: string | null;
  clientPhone: string | null;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: string;
  assignedBy: string;
  createdAt: string;
};

export type DriverTripDto = {
  id: string;
  bookingId: string;
  znCode: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
  status: string;
};

export type LivePositionDto = {
  driverId: string;
  driverName: string;
  lat: number;
  lng: number;
  status: string;
  recordedAt: string;
};

type AssignmentWithBooking = DriverAssignment & {
  booking: Booking & { client: Client };
};

type DriverWithUser = DriverProfile & {
  user: StaffUser;
  driverAssignments?: AssignmentWithBooking[];
};

export function mapDriverUser(user: StaffUser): DriverUserSummary {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
  };
}

function mapActiveAssignmentSummary(
  row?: AssignmentWithBooking | null,
): DriverActiveAssignmentSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
    clientPhone: row.booking.client.phone ?? null,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
  };
}

export function mapDriverListItem(row: DriverWithUser): DriverListItemDto {
  const active = row.driverAssignments?.find((a) => a.status === 'active') ?? null;
  return {
    ...mapDriverProfile(row),
    user: mapDriverUser(row.user),
    activeAssignment: mapActiveAssignmentSummary(active),
  };
}

export function mapDriverDetail(
  row: DriverWithUser,
  assignments: AssignmentWithBooking[],
) {
  return {
    ...mapDriverListItem(row),
    assignments: assignments.map(mapAssignment),
  };
}

export function mapAssignment(row: AssignmentWithBooking): DriverAssignmentDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
    clientPhone: row.booking.client.phone ?? null,
    driverId: row.driverId,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    assignedBy: row.assignedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapDriverTrip(row: AssignmentWithBooking): DriverTripDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    status: row.status,
  };
}

export function mapScheduleItem(
  row: ItineraryItem & {
    booking: { znCode: string; client: { fullName: string } };
  },
) {
  return {
    ...mapItineraryItem(row),
    znCode: row.booking.znCode,
    clientName: row.booking.client.fullName,
  };
}

export function mapLivePosition(
  driverId: string,
  driverName: string,
  status: string,
  payload: { lat: number; lng: number; recordedAt: string },
): LivePositionDto {
  return {
    driverId,
    driverName,
    lat: payload.lat,
    lng: payload.lng,
    status,
    recordedAt: payload.recordedAt,
  };
}
