import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  APP_WEB_ORIGIN: z.string().default('http://localhost:5173'),
  APP_MOBILE_SCHEME: z.string().default('zeengo://'),
  VIP_PRICE_USD: z.coerce.number().default(100),
  STRIPE_LINK_DEFAULT_EXPIRY_HOURS: z.coerce.number().default(48),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_STAFF_PASSWORD: z.string().optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  FCM_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  STORAGE_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v === 's3' ? 's3' : 'local')),
  STORAGE_LOCAL_DIR: z.string().optional().default(''),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_REGION: z.string().optional().default(''),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),
  STORAGE_ENDPOINT: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === 'production') {
    const stripe = (data.STRIPE_SECRET_KEY || '').trim();
    if (!stripe || !stripe.startsWith('sk_') || stripe.includes('replace')) {
      // Soft warning at boot — hard fail happens on Stripe link create.
      // eslint-disable-next-line no-console
      console.warn(
        '[env] NODE_ENV=production but STRIPE_SECRET_KEY is missing/invalid. Stripe payment links will return 503.',
      );
    }
    if (
      !(data.FCM_SERVICE_ACCOUNT_JSON || '').trim() &&
      !(data.FCM_SERVICE_ACCOUNT_PATH || '').trim() &&
      !(data.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '[env] NODE_ENV=production but FCM credentials are missing. Push delivery will report fcm_not_configured.',
      );
    }
  }

  return data;
}
