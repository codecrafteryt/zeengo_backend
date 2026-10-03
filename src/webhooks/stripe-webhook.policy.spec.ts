import { resolveStripeWebhookMode } from './stripe-webhook.policy';

describe('stripe-webhook.policy', () => {
  it('rejects unsigned events in production when the secret is missing', () => {
    expect(
      resolveStripeWebhookMode({
        nodeEnv: 'production',
        webhookSecret: '',
        hasRawBody: true,
        hasSignature: false,
        devHeader: '1',
      }),
    ).toBe('reject');
  });

  it('verifies when a webhook secret and Stripe signature are present', () => {
    expect(
      resolveStripeWebhookMode({
        nodeEnv: 'production',
        webhookSecret: 'whsec_test',
        hasRawBody: true,
        hasSignature: true,
      }),
    ).toBe('verify');
  });

  it('allows the local dev header only outside production', () => {
    expect(
      resolveStripeWebhookMode({
        nodeEnv: 'development',
        webhookSecret: '',
        hasRawBody: false,
        hasSignature: false,
        devHeader: '1',
      }),
    ).toBe('dev-unsigned');
  });
});
