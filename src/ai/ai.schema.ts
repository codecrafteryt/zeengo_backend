import { z } from 'zod';

export const parseItinerarySchema = z.object({
  rawText: z.string().min(1),
});

export const chatbotSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1),
});

export const emailDraftSchema = z.object({
  purpose: z.string().min(1),
  context: z.string().optional(),
  tone: z.enum(['formal', 'friendly', 'concise']).optional(),
  recipientName: z.string().optional(),
});

export const aiEodReportSchema = z.object({
  reportDate: z.string().date().optional(),
});

export type ParseItineraryDto = z.infer<typeof parseItinerarySchema>;
export type ChatbotDto = z.infer<typeof chatbotSchema>;
export type EmailDraftDto = z.infer<typeof emailDraftSchema>;
export type AiEodReportDto = z.infer<typeof aiEodReportSchema>;

export type ParsedItineraryDay = {
  dayNumber: number;
  items: Array<{
    time?: string;
    title: string;
    description?: string;
    locationName?: string;
  }>;
};

export type ParseItineraryResult = {
  days: ParsedItineraryDay[];
  parser: 'heuristic' | 'claude';
};

export type ChatbotResult = {
  sessionId: string;
  reply: string;
  source: 'stub' | 'claude';
};

export type EmailDraftResult = {
  subject: string;
  body: string;
  source: 'stub' | 'claude';
};

export type AiEodReportResult = {
  reportDate: string;
  content: string;
  summary: Record<string, number>;
  source: 'stub' | 'claude';
};
