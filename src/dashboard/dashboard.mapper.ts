import { EodReport } from '@prisma/client';
import { DashboardSummaryDto, UrgentAlertDto } from './dashboard.schema';
import { mapDailyOperationItem } from '../itineraries/itineraries.mapper';
import type { ItineraryItem } from '@prisma/client';

export function mapSummary(data: DashboardSummaryDto): DashboardSummaryDto {
  return data;
}

export function mapUrgentAlert(alert: UrgentAlertDto): UrgentAlertDto {
  return alert;
}

export function mapEodReport(row: EodReport) {
  return {
    id: row.id,
    reportDate: row.reportDate.toISOString().slice(0, 10),
    content: row.content,
    generatedBy: row.generatedBy,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapScheduleItem(
  row: ItineraryItem & {
    booking: { znCode: string; client: { fullName: string } };
  },
) {
  return mapDailyOperationItem(row);
}
