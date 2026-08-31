import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';
import {
  aiEodReportSchema,
  chatbotSchema,
  emailDraftSchema,
  parseItinerarySchema,
} from './ai.schema';
import type {
  AiEodReportDto,
  ChatbotDto,
  EmailDraftDto,
  ParseItineraryDto,
} from './ai.schema';

const OPS_ROLES = [StaffRole.admin, StaffRole.ops_manager] as const;
const EMAIL_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;
const STAFF_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.splizer,
  StaffRole.support,
  StaffRole.driver,
] as const;

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('parse-itinerary')
  @Roles(...OPS_ROLES)
  parseItinerary(@Body(zodPipe(parseItinerarySchema)) body: ParseItineraryDto) {
    return this.aiService.parseItinerary(body);
  }

  @Post('chatbot')
  @Roles(...STAFF_ROLES)
  chatbot(@Body(zodPipe(chatbotSchema)) body: ChatbotDto) {
    return this.aiService.chatbot(body);
  }

  @Post('email-draft')
  @Roles(...EMAIL_ROLES)
  emailDraft(@Body(zodPipe(emailDraftSchema)) body: EmailDraftDto) {
    return this.aiService.emailDraft(body);
  }

  @Post('eod-report')
  @Roles(...OPS_ROLES)
  eodReport(
    @Body(zodPipe(aiEodReportSchema)) body: AiEodReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.aiService.generateEodReport(user, body);
  }
}
