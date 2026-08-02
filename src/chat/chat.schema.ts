import { z } from 'zod';
import { ConversationType } from '@prisma/client';

export const createConversationSchema = z.object({
  type: z.nativeEnum(ConversationType),
  participantIds: z.array(z.string().uuid()).optional(),
  bookingId: z.string().uuid().optional(),
  title: z.string().optional(),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createMessageSchema = z.object({
  body: z.string().min(1),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const markReadSchema = z.object({
  lastMessageId: z.string().uuid(),
});

export type CreateConversationDto = z.infer<typeof createConversationSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type CreateMessageDto = z.infer<typeof createMessageSchema>;
export type MarkReadDto = z.infer<typeof markReadSchema>;

export { ConversationType };
