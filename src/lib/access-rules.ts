// Owner status comes from the database role table, never from emails in code.
export function canRevokeOwnerSession(actorId: string, targetId: string, targetIsOwner: boolean) {
  return actorId === targetId || !targetIsOwner;
}
export function isAuthorizedProfile(status: string | undefined, roleCount: number) {
  return status === "active" && roleCount > 0;
}
export function matchesSiteOrigin(projectUrl: string | null, origin: string | null) {
  if (!projectUrl || !origin) return false;
  try { return new URL(projectUrl).origin === new URL(origin).origin; } catch { return false; }
}