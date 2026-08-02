import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createEodReportSchema,
  dashboardScheduleQuerySchema,
} from './dashboard.schema';
import type {
  CreateEodReportDto,
  DashboardScheduleQuery,
} from './dashboard.schema';
import { DashboardService } from './dashboard.service';

const DASHBOARD_ROLES = [StaffRole.admin, StaffRole.ops_manager] as const;

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles(...DASHBOARD_ROLES)
  summary(@CurrentUser() user: AuthPrincipal) {
    return this.dashboardService.getSummary(user);
  }

  @Get('urgent-alerts')
  @Roles(...DASHBOARD_ROLES)
  urgentAlerts() {
    return this.dashboardService.getUrgentAlerts();
  }

  @Get('schedule')
  @Roles(...DASHBOARD_ROLES)
  schedule(
    @Query(zodPipe(dashboardScheduleQuerySchema)) query: DashboardScheduleQuery,
  ) {
    return this.dashboardService.getSchedule(query);
  }

  @Post('eod-report')
  @Roles(...DASHBOARD_ROLES)
  createEodReport(
    @Body(zodPipe(createEodReportSchema)) body: CreateEodReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.dashboardService.createEodReport(user, body);
  }

  @Post('eod-report/:id/send')
  @Roles(...DASHBOARD_ROLES)
  sendEodReport(@Param('id') id: string) {
    return this.dashboardService.sendEodReport(id);
  }
}
