import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createStripeLinkSchema,
  listPaymentsHistoryQuerySchema,
  listPaymentsQuerySchema,
  recordCashPaymentSchema,
} from './payments.schema';
import type {
  CreateStripeLinkDto,
  ListPaymentsHistoryQuery,
  ListPaymentsQuery,
  RecordCashPaymentDto,
} from './payments.schema';
import { PaymentsService } from './payments.service';

const PAYMENT_WRITE_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.splizer,
] as const;

const PAYMENT_HISTORY_ROLES = [
  StaffRole.splizer,
  StaffRole.admin,
  StaffRole.ops_manager,
] as const;

const PAYMENT_ADMIN_ROLES = [StaffRole.admin, StaffRole.ops_manager] as const;

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('cash')
  @Roles(...PAYMENT_WRITE_ROLES)
  recordCash(
    @Body(zodPipe(recordCashPaymentSchema)) body: RecordCashPaymentDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.paymentsService.recordCashPayment(body, user.sub);
  }

  @Post('stripe-link')
  @Roles(...PAYMENT_WRITE_ROLES)
  createStripeLink(
    @Body(zodPipe(createStripeLinkSchema)) body: CreateStripeLinkDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.paymentsService.createStripeLink(body, user.sub);
  }

  @Get('history')
  @Roles(...PAYMENT_HISTORY_ROLES)
  history(
    @Query(zodPipe(listPaymentsHistoryQuerySchema)) query: ListPaymentsHistoryQuery,
  ) {
    return this.paymentsService.listHistory(query);
  }

  @Get()
  @Roles(...PAYMENT_ADMIN_ROLES)
  list(@Query(zodPipe(listPaymentsQuerySchema)) query: ListPaymentsQuery) {
    return this.paymentsService.list(query);
  }
}
