import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { PaymentsService } from '../payments/payments.service';

const OPENED_EVENT_HINTS = ['opened', 'view', 'created'] as const;

@Injectable()
export class WebhooksService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY', '');
    if (key.startsWith('sk_')) {
      this.stripe = new Stripe(key);
    }
  }

  verifyAndParseEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    devHeader: string | undefined,
    parsedBody: unknown,
  ): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');

    if (webhookSecret) {
      if (!rawBody || !signature) {
        throw AppError.validation('Missing Stripe signature or raw body');
      }
      if (!this.stripe) {
        throw AppError.validation('Stripe is not configured');
      }
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    }

    if (devHeader !== '1') {
      throw AppError.unauthorized(
        'Dev webhook requires header x-zeengo-dev-webhook: 1',
      );
    }

    return parsedBody as Stripe.Event;
  }

  async handleStripeEvent(event: Stripe.Event) {
    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
    });

    if (existing) {
      return { received: true, duplicate: true };
    }

    await this.prisma.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
      },
    });

    const paymentId = await this.payments.resolvePaymentIdFromStripeEvent(event);
    if (!paymentId) {
      return { received: true, handled: false };
    }

    const session =
      event.type.startsWith('checkout.session.') ?
        (event.data.object as Stripe.Checkout.Session)
      : null;

    if (event.type === 'checkout.session.completed') {
      await this.payments.applyStripeWebhookStatus({
        paymentId,
        status: PaymentStatus.paid,
        stripeSessionId: session?.id,
        paidAt: new Date(),
      });
      return { received: true, handled: true, status: PaymentStatus.paid };
    }

    if (event.type === 'checkout.session.expired') {
      await this.payments.applyStripeWebhookStatus({
        paymentId,
        status: PaymentStatus.expired,
        stripeSessionId: session?.id,
      });
      return { received: true, handled: true, status: PaymentStatus.expired };
    }

    if (this.isOpenedEvent(event.type)) {
      await this.payments.applyStripeWebhookStatus({
        paymentId,
        status: PaymentStatus.opened,
        stripeSessionId: session?.id,
      });
      return { received: true, handled: true, status: PaymentStatus.opened };
    }

    return { received: true, handled: false };
  }

  private isOpenedEvent(eventType: string): boolean {
    const normalized = eventType.toLowerCase();
    return OPENED_EVENT_HINTS.some((hint) => normalized.includes(hint));
  }
}
