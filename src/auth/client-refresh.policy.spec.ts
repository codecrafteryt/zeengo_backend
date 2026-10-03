import { clientRefreshRevokeKey } from './client-refresh.policy';

describe('client-refresh.policy', () => {
  it('namespaces revoked client refresh hashes', () => {
    expect(clientRefreshRevokeKey('deadbeef')).toBe('refresh:revoked:deadbeef');
  });
});
