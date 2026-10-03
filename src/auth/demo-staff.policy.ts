/**
 * Demo staff must never reset production passwords on boot.
 * Explicit seed (`prisma db seed` / POST /system/seed-demo) can still force a reset.
 */
export function shouldBootstrapDemoStaff(
  nodeEnv: string,
  allowDemoStaff?: string | null,
): boolean {
  if (nodeEnv === 'production') {
    return allowDemoStaff === 'true';
  }
  return true;
}

export function shouldResetDemoPasswords(
  nodeEnv: string,
  forceReset = false,
): boolean {
  if (forceReset) return true;
  return nodeEnv !== 'production';
}
