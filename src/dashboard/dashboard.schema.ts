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
  unassignedClients: number;
  opsQueue: number;
};

export type UrgentAlertDto = {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  entityId: string | null;
  createdAt: string;
};
