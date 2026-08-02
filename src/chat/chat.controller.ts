import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createConversationSchema,
  createMessageSchema,
  listMessagesQuerySchema,
  markReadSchema,
} from './chat.schema';
import type {
  CreateConversationDto,
  CreateMessageDto,
  ListMessagesQuery,
  MarkReadDto,
} from './chat.schema';
import { ChatService } from './chat.service';

const CHAT_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
  'client',
] as const;

const FIELD_ROLES = [StaffRole.splizer, StaffRole.driver] as const;

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @Roles(...CHAT_ROLES)
  listConversations(@CurrentUser() user: AuthPrincipal) {
    return this.chatService.listConversations(user);
  }

  @Post('conversations')
  @Roles(...CHAT_ROLES)
  createConversation(
    @Body(zodPipe(createConversationSchema)) body: CreateConversationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.chatService.createConversation(body, user);
  }

  @Get('conversations/:id/messages')
  @Roles(...CHAT_ROLES)
  listMessages(
    @Param('id') id: string,
    @Query(zodPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.chatService.listMessages(id, query, user);
  }

  @Post('conversations/:id/messages')
  @Roles(...CHAT_ROLES)
  createMessage(
    @Param('id') id: string,
    @Body(zodPipe(createMessageSchema)) body: CreateMessageDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.chatService.createMessage(id, body, user);
  }

  @Post('conversations/:id/read')
  @Roles(...CHAT_ROLES)
  markRead(
    @Param('id') id: string,
    @Body(zodPipe(markReadSchema)) body: MarkReadDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.chatService.markRead(id, body, user);
  }

  @Get('client-threads')
  @Roles(...FIELD_ROLES, StaffRole.admin, StaffRole.ops_manager, StaffRole.support)
  listClientThreads(@CurrentUser() user: AuthPrincipal) {
    return this.chatService.listClientThreads(user);
  }
}
