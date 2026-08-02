import {
  Client,
  Conversation,
  ConversationParticipant,
  Message,
  StaffUser,
} from '@prisma/client';

export type ConversationDto = {
  id: string;
  type: string;
  bookingId: string | null;
  title: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  senderType: string;
  senderStaffId: string | null;
  senderClientId: string | null;
  senderName: string | null;
  body: string;
  bodyTranslated: Record<string, string>;
  sourceLang: string | null;
  attachments: unknown[];
  createdAt: string;
};

type ConversationRow = Conversation & {
  messages?: Message[];
  participants?: ConversationParticipant[];
};

type MessageRow = Message & {
  senderStaff?: StaffUser | null;
  senderClient?: Client | null;
};

export function mapConversation(
  row: ConversationRow,
  unreadCount = 0,
  lastMessageAt: string | null = null,
): ConversationDto {
  const lastMsg = row.messages?.[0];
  return {
    id: row.id,
    type: row.type,
    bookingId: row.bookingId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: lastMessageAt ?? lastMsg?.createdAt.toISOString() ?? null,
    unreadCount,
  };
}

export function mapMessage(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    senderStaffId: row.senderStaffId,
    senderClientId: row.senderClientId,
    senderName: row.senderStaff?.fullName ?? row.senderClient?.fullName ?? null,
    body: row.body,
    bodyTranslated: (row.bodyTranslated as Record<string, string>) ?? {},
    sourceLang: row.sourceLang,
    attachments: (row.attachments as unknown[]) ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

export function detectSourceLang(body: string): string {
  if (/[\u0600-\u06FF]/.test(body)) return 'ar';
  if (/[\u0400-\u04FF]/.test(body)) return 'ru';
  return 'en';
}
