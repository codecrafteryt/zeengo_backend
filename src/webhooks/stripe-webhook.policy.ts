export type StripeWebhookMode = 'verify' | 'dev-unsigned' | 'reject';

/**
 * Production never accepts unsigned Stripe events, even with a dev header.
 * Local/dev may accept `x-zeengo-dev-webhook: 1` only when no webhook secret is set.
 */
export function resolveStripeWebhookMode(input: {
  nodeEnv: string;
  webhookSecret: string;
  hasRawBody: boolean;
  hasSignature: boolean;
  devHeader?: string;
}): StripeWebhookMode {
  const secret = input.webhookSecret.trim();
  if (secret) {
    return input.hasRawBody && input.hasSignature ? 'verify' : 'reject';
  }
  if (input.nodeEnv === 'production') {
    return 'reject';
  }
  return input.devHeader === '1' ? 'dev-unsigned' : 'reject';
}
