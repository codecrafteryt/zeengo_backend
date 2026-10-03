import {
  shouldBootstrapDemoStaff,
  shouldResetDemoPasswords,
} from './demo-staff.policy';

describe('demo-staff.policy', () => {
  it('skips boot seed in production unless ALLOW_DEMO_STAFF=true', () => {
    expect(shouldBootstrapDemoStaff('production', undefined)).toBe(false);
    expect(shouldBootstrapDemoStaff('production', '')).toBe(false);
    expect(shouldBootstrapDemoStaff('production', 'true')).toBe(true);
    expect(shouldBootstrapDemoStaff('development', undefined)).toBe(true);
    expect(shouldBootstrapDemoStaff('test', undefined)).toBe(true);
  });

  it('never resets existing passwords in production unless forced', () => {
    expect(shouldResetDemoPasswords('production')).toBe(false);
    expect(shouldResetDemoPasswords('production', true)).toBe(true);
    expect(shouldResetDemoPasswords('development')).toBe(true);
  });
});
