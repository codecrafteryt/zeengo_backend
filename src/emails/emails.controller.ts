import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  listEmailsQuerySchema,
  previewEmailSchema,
  sendEmailSchema,
} from './emails.schema';
import type {
  ListEmailsQuery,
  PreviewEmailDto,
  SendEmailDto,
} from './emails.schema';
import { EmailsService } from './emails.service';

const EMAIL_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('emails')
@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Get('templates')
  @Roles(...EMAIL_ROLES)
  templates() {
    return this.emailsService.templates();
  }

  @Get('recipients')
  @Roles(...EMAIL_ROLES)
  recipients(@CurrentUser() user: AuthPrincipal) {
    return this.emailsService.recipients(user);
  }

  @Get()
  @Roles(...EMAIL_ROLES)
  list(
    @Query(zodPipe(listEmailsQuerySchema)) query: ListEmailsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.emailsService.list(query, user);
  }

  @Post('preview')
  @Roles(...EMAIL_ROLES)
  preview(
    @Body(zodPipe(previewEmailSchema)) body: PreviewEmailDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.emailsService.preview(body, user);
  }

  @Post('send')
  @Roles(...EMAIL_ROLES)
  send(
    @Body(zodPipe(sendEmailSchema)) body: SendEmailDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.emailsService.send(body, user);
  }
}
