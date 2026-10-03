import { resolveCorsOrigins } from './cors.policy';

describe('cors.policy', () => {
  it('allows any origin in development when unset or wildcard', () => {
    expect(resolveCorsOrigins('', 'development')).toBe(true);
    expect(resolveCorsOrigins('*', 'development')).toBe(true);
  });

  it('never returns wildcard in production', () => {
    const origins = resolveCorsOrigins('*', 'production');
    expect(origins).not.toBe(true);
    expect(origins).toEqual(
      expect.arrayContaining([
        'https://zeengo-website.vercel.app',
        'https://zeengo-admin.vercel.app',
      ]),
    );
    expect(origins).not.toContain('*');
  });

  it('keeps explicit production origins and drops *', () => {
    const origins = resolveCorsOrigins(
      'https://zeengo-website.vercel.app,*',
      'production',
    ) as string[];
    expect(origins).toContain('https://zeengo-website.vercel.app');
    expect(origins).not.toContain('*');
    expect(origins).not.toContain('https://evil.example');
  });
});
