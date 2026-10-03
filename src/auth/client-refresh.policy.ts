/** Client refresh JWTs are not stored in Redis; logout must denylist the hash. */
export function clientRefreshRevokeKey(tokenHash: string): string {
  return `refresh:revoked:${tokenHash}`;
}
