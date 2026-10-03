/** Redis cache for staff isActive so JWT validation is not a DB hit every request. */
export const STAFF_ACTIVE_CACHE_TTL_SECONDS = 45;

export function staffActiveCacheKey(staffId: string): string {
  return `staff:active:${staffId}`;
}

export function parseStaffActiveCache(raw: string | null): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function encodeStaffActiveCache(isActive: boolean): string {
  return isActive ? '1' : '0';
}
