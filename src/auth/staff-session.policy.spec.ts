import {
  encodeStaffActiveCache,
  parseStaffActiveCache,
  staffActiveCacheKey,
} from './staff-session.policy';

describe('staff-session.policy', () => {
  it('uses a per-staff cache key', () => {
    expect(staffActiveCacheKey('abc')).toBe('staff:active:abc');
  });

  it('round-trips active flags', () => {
    expect(parseStaffActiveCache(encodeStaffActiveCache(true))).toBe(true);
    expect(parseStaffActiveCache(encodeStaffActiveCache(false))).toBe(false);
    expect(parseStaffActiveCache(null)).toBeNull();
    expect(parseStaffActiveCache('x')).toBeNull();
  });
});
