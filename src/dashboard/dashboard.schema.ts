import { z } from 'zod';

export const dashboardScheduleQuerySchema = z.object({
  date: z.enum(['today', 'tomorrow']).default('today'),
});

export const createEodReportSchema = z.object({
  reportDate: z.string().date().optional(),
});

export type DashboardScheduleQuery = z.infer<typeof dashboardScheduleQuerySchema>;
export type CreateEodReportDto = z.infer<typeof createEodReportSchema>;

export type DashboardSummaryDto = {
  activeClients: number;
  urgentTasks: number;
  driversInField: number;
  revenueToday: number;
  todaysItinerary: number;
  itineraryProgress: number;
  unassignedClients: number;
  opsQueue: number;
  activeSos: number;
  pendingEdits: number;
};

export type UrgentAlertDto = {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  entityId: string | null;
  createdAt: string;
  znCode?: string | null;
  clientName?: string | null;
};

export type UnassignedClientDto = {
  bookingId: string;
  znCode: string;
  clientName: string;
  packageName: string | null;
  arrivalDate: string | null;
};

export type DashboardDriverDto = {
  id: string;
  fullName: string;
  phone: string | null;
  status: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plateNumber: string | null;
  rating: number;
  activeAssignmentZn: string | null;
};

export type DashboardOverviewDto = {
  summary: DashboardSummaryDto;
  alerts: UrgentAlertDto[];
  unassigned: UnassignedClientDto[];
  drivers: DashboardDriverDto[];
  generatedAt: string;
  cacheTtlSeconds: number;
};
