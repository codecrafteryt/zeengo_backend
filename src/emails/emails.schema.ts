import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';

export const EMAIL_TEMPLATES = [
  'booking_confirmation',
  'itinerary_change',
  'sos_followup',
  'invoice_receipt',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATES)[number];

export const listEmailsQuerySchema = paginationSchema;

export const previewEmailSchema = z.object({
  bookingId: z.string().uuid(),
  template: z.enum(EMAIL_TEMPLATES),
});

export const sendEmailSchema = previewEmailSchema.extend({
  to: z.string().email().optional(),
});

export type ListEmailsQuery = z.infer<typeof listEmailsQuerySchema>;
export type PreviewEmailDto = z.infer<typeof previewEmailSchema>;
export type SendEmailDto = z.infer<typeof sendEmailSchema>;
