import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { listPaymentsHistoryQuerySchema } from './payments.schema';
import type { ListPaymentsHistoryQuery } from './payments.schema';
import { PaymentsService } from './payments.service';

@ApiTags('splizer')
@Roles(StaffRole.splizer, StaffRole.admin, StaffRole.ops_manager)
@Controller('splizer/clients')
export class SplizerController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(@Query(zodPipe(listPaymentsHistoryQuerySchema)) query: ListPaymentsHistoryQuery) {
    return this.paymentsService.listSplizerClients(query);
  }

  @Get('by-code/:znCode')
  getByCode(@Param('znCode') znCode: string) {
    return this.paymentsService.getSplizerClientByCode(znCode);
  }
}
