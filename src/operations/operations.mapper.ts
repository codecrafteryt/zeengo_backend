import {
  BookingStatus,
  ItineraryItem,
  ItineraryItemStatus,
  BookingDayPlan,
  BookingStaffLink,
  StaffUser,
  Vendor,
} from '@prisma/client';

export type OpsClientCard = {
  bookingId: string;
  znCode: string;
  clientName: string;
  clientPhone: string;
  packageName: string | null;
  status: BookingStatus;
  arrivalDate: string | null;
  departureDate: string | null;
  partySize: number;
  pendingItems: number;
  totalItems: number;
  notConfirmedTitles: string[];
  coordinatorName: string | null;
  driverName: string | null;
  assignmentStatus: string | null;
  createdAt: string;
};

export type OpsActivity = {
  id: string;
  dayNumber: number;
  itemDate: string | null;
  startTime: string | null;
  title: string;
  locationName: string | null;
  status: ItineraryItemStatus;
  carPlan: string | null;
  meetingPoint: string | null;
  guideContact: string | null;
  pdfUrl: string | null;
  notes: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorType: string | null;
  qrPayload: string;
};

export type OpsDay = {
  dayNumber: number;
  planDate: string | null;
  carPlan: string | null;
  notes: string | null;
  notConfirmed: string[];
  activities: OpsActivity[];
};

export type OpsStaffLink = {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  createdAt: string;
};

export type OpsBookingDetail = {
  bookingId: string;
  znCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  nationality: string | null;
  packageName: string | null;
  status: BookingStatus;
  arrivalDate: string | null;
  departureDate: string | null;
  partySize: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  internalNotes: string | null;
  days: OpsDay[];
  staff: OpsStaffLink[];
  driverName: string | null;
  driverPhone: string | null;
  assignmentStatus: string | null;
  checklist: Array<{ id: string; title: string; isDone: boolean }>;
  editRequests: Array<{
    id: string;
    type: string;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
  }>;
};

function formatTime(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(11, 19);
}

function buildQr(params: {
  znCode: string;
  activityId: string;
  title: string;
  pdfUrl: string | null;
}) {
  return JSON.stringify({
    znCode: params.znCode,
    activityId: params.activityId,
    title: params.title,
    pdfUrl: params.pdfUrl,
  });
}

export function mapOpsActivity(
  row: ItineraryItem & { vendor?: Vendor | null },
  znCode: string,
): OpsActivity {
  return {
    id: row.id,
    dayNumber: row.dayNumber,
    itemDate: row.itemDate?.toISOString().slice(0, 10) ?? null,
    startTime: formatTime(row.startTime),
    title: row.title,
    locationName: row.locationName,
    status: row.status,
    carPlan: row.carPlan,
    meetingPoint: row.meetingPoint,
    guideContact: row.guideContact,
    pdfUrl: row.pdfUrl,
    notes: row.notes,
    vendorId: row.vendorId,
    vendorName: row.vendor?.name ?? null,
    vendorType: row.vendor?.type ?? null,
    qrPayload: buildQr({
      znCode,
      activityId: row.id,
      title: row.title,
      pdfUrl: row.pdfUrl,
    }),
  };
}

export function mapOpsDay(
  dayNumber: number,
  plan: BookingDayPlan | undefined,
  activities: OpsActivity[],
): OpsDay {
  const notConfirmed = activities
    .filter((a) => a.status === 'pending')
    .map((a) => a.title);
  return {
    dayNumber,
    planDate: plan?.planDate?.toISOString().slice(0, 10) ?? activities[0]?.itemDate ?? null,
    carPlan: plan?.carPlan ?? null,
    notes: plan?.notes ?? null,
    notConfirmed,
    activities,
  };
}

export function mapStaffLink(
  row: BookingStaffLink & { staff: StaffUser },
): OpsStaffLink {
  return {
    id: row.id,
    staffId: row.staffId,
    staffName: row.staff.fullName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}
