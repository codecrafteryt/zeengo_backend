/** Known production SPAs. Used when APP_WEB_ORIGIN is missing or contains `*`. */
export const PRODUCTION_FRONTEND_ORIGINS = [
  'https://zeengo-website.vercel.app',
  'https://zeengo-admin.vercel.app',
] as const;

export function resolveCorsOrigins(
  raw: string | undefined,
  nodeEnv: string,
): boolean | string[] {
  const list = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowWildcard = list.length === 0 || list.includes('*');

  if (allowWildcard && nodeEnv !== 'production') {
    return true;
  }

  const origins = new Set(
    list.filter((origin) => origin !== '*'),
  );

  if (nodeEnv !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:5174');
    origins.add('http://127.0.0.1:5174');
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:4173');
  } else {
    for (const origin of PRODUCTION_FRONTEND_ORIGINS) {
      origins.add(origin);
    }
  }

  return [...origins];
}
