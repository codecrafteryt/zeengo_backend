import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';
import { listAuditLogsQuerySchema } from './audit-logs.schema';
import type { ListAuditLogsQuery } from './audit-logs.schema';

@ApiTags('audit-logs')
@Controller('audit-logs')
@Roles(StaffRole.admin, StaffRole.ops_manager)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(
    @Query(zodPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.auditLogs.list(query, user);
  }
}
