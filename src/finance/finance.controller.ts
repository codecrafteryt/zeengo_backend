import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { revenueByMethodQuerySchema } from './finance.schema';
import type { RevenueByMethodQuery } from './finance.schema';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@Roles(StaffRole.admin, StaffRole.ops_manager)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  summary() {
    return this.financeService.summary();
  }

  @Get('revenue-series')
  revenueSeries(
    @Query(zodPipe(revenueByMethodQuerySchema)) query: RevenueByMethodQuery,
  ) {
    return this.financeService.revenueSeries(query);
  }

  @Get('revenue-by-method')
  revenueByMethod(
    @Query(zodPipe(revenueByMethodQuerySchema)) query: RevenueByMethodQuery,
  ) {
    return this.financeService.revenueByMethod(query);
  }
}
