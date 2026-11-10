// Backoff progressivo de login: 3 falhas -> 10min, 4 -> 15min, 5 -> 20min, 6 -> bloqueio administrativo.
export type LockDecision = { cooldownMinutes: number | null; adminLock: boolean };

export function lockAfterFailures(failedCount: number): LockDecision {
  if (failedCount >= 6) return { cooldownMinutes: null, adminLock: true };
  if (failedCount === 5) return { cooldownMinutes: 20, adminLock: false };
  if (failedCount === 4) return { cooldownMinutes: 15, adminLock: false };
  if (failedCount === 3) return { cooldownMinutes: 10, adminLock: false };
  return { cooldownMinutes: null, adminLock: false };
}
