import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { DashboardService } from '../dashboard/dashboard.service';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import type {
  AiEodReportDto,
  AiEodReportResult,
  ChatbotDto,
  ChatbotResult,
  EmailDraftDto,
  EmailDraftResult,
  ParseItineraryDto,
  ParseItineraryResult,
  ParsedItineraryDay,
} from './ai.schema';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const AI_TIMEOUT_MS = 25_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;

  constructor(
    private readonly config: ConfigService,
    private readonly dashboard: DashboardService,
  ) {
    const key = this.config.get<string>('ANTHROPIC_API_KEY', '').trim();
    this.client = key ? new Anthropic({ apiKey: key }) : null;
  }

  async parseItinerary(dto: ParseItineraryDto): Promise<ParseItineraryResult> {
    if (!this.client) {
      return {
        days: this.parseItineraryHeuristic(dto.rawText),
        parser: 'heuristic',
      };
    }

    try {
      const text = await this.callClaude(
        'Parse the following raw itinerary text into JSON with shape { "days": [{ "dayNumber": number, "items": [{ "time"?: "HH:MM", "title": string, "description"?: string, "locationName"?: string }] }] }. Return JSON only, no markdown.',
        dto.rawText,
      );
      const parsed = JSON.parse(this.extractJson(text)) as {
        days: ParsedItineraryDay[];
      };
      return { days: parsed.days ?? [], parser: 'claude' };
    } catch (err) {
      this.logger.warn(
        `Claude itinerary parse failed, falling back to heuristic: ${err instanceof Error ? err.message : err}`,
      );
      return {
        days: this.parseItineraryHeuristic(dto.rawText),
        parser: 'heuristic',
      };
    }
  }

  async chatbot(dto: ChatbotDto): Promise<ChatbotResult> {
    const sessionId = dto.sessionId ?? randomUUID();

    if (!this.client) {
      return {
        sessionId,
        reply: this.chatbotStub(dto.message),
        source: 'stub',
      };
    }

    try {
      const reply = await this.callClaude(
        'You are Zeengo ops assistant for luxury travel in Russia (Moscow, St Petersburg). Answer staff questions briefly and practically about itineraries, VIP clients, drivers, and payments. If unsure, say what to check in the dashboard.',
        dto.message,
      );
      return { sessionId, reply: reply.trim(), source: 'claude' };
    } catch (err) {
      this.logger.warn(
        `Claude chatbot failed, using stub: ${err instanceof Error ? err.message : err}`,
      );
      return {
        sessionId,
        reply: this.chatbotStub(dto.message),
        source: 'stub',
      };
    }
  }

  async emailDraft(dto: EmailDraftDto): Promise<EmailDraftResult> {
    if (!this.client) {
      return this.emailDraftStub(dto);
    }

    try {
      const text = await this.callClaude(
        `Draft a client email as JSON { "subject": string, "body": string }. Tone: ${dto.tone ?? 'friendly'}. Purpose: ${dto.purpose}.${dto.recipientName ? ` Recipient: ${dto.recipientName}.` : ''}${dto.context ? ` Context: ${dto.context}` : ''}`,
        'Return JSON only.',
      );
      const parsed = JSON.parse(this.extractJson(text)) as {
        subject?: string;
        body?: string;
      };
      return {
        subject: parsed.subject ?? `Re: ${dto.purpose}`,
        body: parsed.body ?? text,
        source: 'claude',
      };
    } catch (err) {
      this.logger.warn(
        `Claude email draft failed, using stub: ${err instanceof Error ? err.message : err}`,
      );
      return this.emailDraftStub(dto);
    }
  }

  async generateEodReport(
    user: AuthPrincipal,
    dto: AiEodReportDto,
  ): Promise<AiEodReportResult> {
    this.dashboard.assertDashboardAccess(user);
    const summary = await this.dashboard.getSummary(user);
    const reportDate = dto.reportDate ?? new Date().toISOString().slice(0, 10);

    if (!this.client) {
      return {
        reportDate,
        content: this.eodStubContent(reportDate, summary),
        summary: {
          activeClients: summary.activeClients,
          urgentTasks: summary.urgentTasks,
          driversInField: summary.driversInField,
          revenueToday: summary.revenueToday,
          todaysItinerary: summary.todaysItinerary,
          unassignedClients: summary.unassignedClients,
          opsQueue: summary.opsQueue,
        },
        source: 'stub',
      };
    }

    try {
      const narrative = await this.callClaude(
        'Write a concise end-of-day operations report for Zeengo Russia ops team in markdown. Use the KPI JSON provided.',
        JSON.stringify({ reportDate, summary }, null, 2),
      );
      return {
        reportDate,
        content: narrative.trim(),
        summary: {
          activeClients: summary.activeClients,
          urgentTasks: summary.urgentTasks,
          driversInField: summary.driversInField,
          revenueToday: summary.revenueToday,
          todaysItinerary: summary.todaysItinerary,
          unassignedClients: summary.unassignedClients,
          opsQueue: summary.opsQueue,
        },
        source: 'claude',
      };
    } catch (err) {
      this.logger.warn(
        `Claude EOD report failed, using stub: ${err instanceof Error ? err.message : err}`,
      );
      return {
        reportDate,
        content: this.eodStubContent(reportDate, summary),
        summary: {
          activeClients: summary.activeClients,
          urgentTasks: summary.urgentTasks,
          driversInField: summary.driversInField,
          revenueToday: summary.revenueToday,
          todaysItinerary: summary.todaysItinerary,
          unassignedClients: summary.unassignedClients,
          opsQueue: summary.opsQueue,
        },
        source: 'stub',
      };
    }
  }

  private parseItineraryHeuristic(rawText: string): ParsedItineraryDay[] {
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const days: ParsedItineraryDay[] = [];
    let currentDay: ParsedItineraryDay | null = null;
    const dayRe = /^Day\s+(\d+)\s*[—\-–:]/i;
    const timeRe = /^(\d{1,2}:\d{2})\s+(.+)$/;

    for (const line of lines) {
      const dayMatch = line.match(dayRe);
      if (dayMatch) {
        currentDay = {
          dayNumber: Number.parseInt(dayMatch[1], 10),
          items: [],
        };
        days.push(currentDay);
        continue;
      }

      const timeMatch = line.match(timeRe);
      if (timeMatch) {
        if (!currentDay) {
          currentDay = { dayNumber: 1, items: [] };
          days.push(currentDay);
        }
        currentDay.items.push({ time: timeMatch[1], title: timeMatch[2] });
        continue;
      }

      if (currentDay) {
        const last = currentDay.items[currentDay.items.length - 1];
        if (last && !last.description) {
          last.description = line;
        } else {
          currentDay.items.push({ title: line });
        }
      }
    }

    return days;
  }

  private chatbotStub(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('driver') || lower.includes('gps')) {
      return 'For live driver positions, open Ops Room → Drivers. GPS updates stream over WebSocket; stale pings may mean the app is backgrounded.';
    }
    if (lower.includes('payment') || lower.includes('stripe')) {
      return 'Payment links expire after 48h by default. Check Finance → Payments for sent/opened links. Stripe webhooks move status to paid; expired links need a new link from Splizer.';
    }
    if (lower.includes('itinerary') || lower.includes('day')) {
      return 'Paste raw itinerary text into AI Parse Itinerary or use Daily Operations for today’s schedule. Day headers like "Day 2 —" and times like "09:00 Kremlin tour" parse cleanly.';
    }
    return 'Zeengo ops assistant (offline mode): I can help with Russia itineraries, VIP clients, drivers, and payments. Set ANTHROPIC_API_KEY for full AI answers, or ask about drivers, payments, or itineraries.';
  }

  private emailDraftStub(dto: EmailDraftDto): EmailDraftResult {
    const name = dto.recipientName ?? 'there';
    const tone = dto.tone ?? 'friendly';
    return {
      subject: `Zeengo — ${dto.purpose}`,
      body: [
        `Hi ${name},`,
        '',
        `Thank you for choosing Zeengo for your Russia experience.`,
        '',
        dto.context?.trim() ?? `Regarding: ${dto.purpose}.`,
        '',
        tone === 'formal'
          ? 'Please let us know if you require any adjustments to your itinerary.'
          : 'Reach out anytime on WhatsApp — your ops team is here to help.',
        '',
        'Warm regards,',
        'Zeengo Guest Experience Team',
      ].join('\n'),
      source: 'stub',
    };
  }

  private eodStubContent(
    reportDate: string,
    summary: {
      activeClients: number;
      urgentTasks: number;
      driversInField: number;
      revenueToday: number;
      todaysItinerary: number;
      unassignedClients: number;
      opsQueue: number;
    },
  ): string {
    return [
      `# End of Day Report — ${reportDate}`,
      '',
      '## KPI snapshot',
      `- Active clients: ${summary.activeClients}`,
      `- Revenue today: SAR ${summary.revenueToday.toFixed(2)}`,
      `- Drivers in field: ${summary.driversInField}`,
      `- Today's itinerary items: ${summary.todaysItinerary}`,
      `- Urgent tasks: ${summary.urgentTasks}`,
      `- Unassigned clients: ${summary.unassignedClients}`,
      `- Ops queue: ${summary.opsQueue}`,
      '',
      '_Generated in offline mode — set ANTHROPIC_API_KEY for AI narrative._',
    ].join('\n');
  }

  private async callClaude(system: string, userContent: string): Promise<string> {
    if (!this.client) {
      throw new Error('Anthropic client not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const response = await this.client.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system,
          messages: [{ role: 'user', content: userContent }],
        },
        { signal: controller.signal },
      );

      const block = response.content.find((part) => part.type === 'text');
      if (!block || block.type !== 'text') {
        throw new Error('Empty Claude response');
      }
      return block.text;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text.trim();
  }
}
