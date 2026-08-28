import {
  Booking,
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
  znCode: string | null;
  clientName: string | null;
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
  participants?: Array<
    ConversationParticipant & { client?: Client | null; staff?: StaffUser | null }
  >;
  booking?: (Booking & { client?: Client | null }) | null;
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
  const clientFromBooking = row.booking?.client;
  const clientParticipant = row.participants?.find((p) => p.clientId)?.client;
  const clientName =
    clientFromBooking?.fullName ?? clientParticipant?.fullName ?? null;
  const znCode = row.booking?.znCode ?? null;
  const title =
    row.title ??
    (znCode && clientName
      ? `${znCode} — ${clientName}`
      : znCode
        ? `${znCode} support`
        : null);

  return {
    id: row.id,
    type: row.type,
    bookingId: row.bookingId,
    title,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: lastMessageAt ?? lastMsg?.createdAt.toISOString() ?? null,
    unreadCount,
    znCode,
    clientName,
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
