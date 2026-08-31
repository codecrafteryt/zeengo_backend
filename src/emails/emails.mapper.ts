import { EmailLog, StaffUser } from '@prisma/client';
import { EMAIL_TEMPLATES, type EmailTemplateKey } from './emails.schema';

export const EMAIL_TEMPLATE_META: Array<{
  id: EmailTemplateKey;
  name: string;
}> = [
  { id: 'booking_confirmation', name: 'Booking Confirmations' },
  { id: 'itinerary_change', name: 'Itinerary Changes' },
  { id: 'sos_followup', name: 'SOS Follow-ups' },
  { id: 'invoice_receipt', name: 'Invoice Receipts' },
];

export type EmailRecipientDto = {
  bookingId: string;
  znCode: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  packageName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  isVip: boolean;
  status: string;
};

export type EmailPreviewDto = {
  to: string | null;
  toName: string;
  template: EmailTemplateKey;
  templateName: string;
  subject: string;
  body: string;
  bookingId: string;
  znCode: string;
};

export type EmailLogDto = {
  id: string;
  bookingId: string | null;
  znCode: string | null;
  toEmail: string;
  toName: string | null;
  template: string;
  templateName: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  sentByName: string | null;
  createdAt: string;
};

export function templateName(id: string) {
  return EMAIL_TEMPLATE_META.find((t) => t.id === id)?.name ?? id;
}

export function mapEmailLog(
  row: EmailLog & { booking?: { znCode: string } | null; sentByUser?: Pick<StaffUser, 'fullName'> | null },
): EmailLogDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? null,
    toEmail: row.toEmail,
    toName: row.toName,
    template: row.template,
    templateName: templateName(row.template),
    subject: row.subject,
    body: row.body,
    status: row.status,
    error: row.error,
    sentByName: row.sentByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export { EMAIL_TEMPLATES };
