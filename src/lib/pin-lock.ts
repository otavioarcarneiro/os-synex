// Master PIN: 3 consecutive wrong PINs lock new attempts for 15 minutes.
export const PIN_MAX_FAILS = 3;
export const PIN_LOCK_MINUTES = 15;
export function pinAfterFailure(prevFails: number, now = new Date()) {
  const failed = prevFails + 1;
  if (failed >= PIN_MAX_FAILS) return { failed: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60000).toISOString() };
  return { failed, lockedUntil: null as string | null };
}
