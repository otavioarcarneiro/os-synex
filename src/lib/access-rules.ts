export const ownerEmails = ["otavio.arcarneiro@gmail.com", "synex.presence@gmail.com"];
export function canRevokeOwnerSession(actorId: string, targetId: string, targetEmail: string) {
  return actorId === targetId || !ownerEmails.includes(targetEmail.trim().toLowerCase());
}
export function isAuthorizedProfile(status: string | undefined, roleCount: number) {
  return status === "active" && roleCount > 0;
}
export function matchesSiteOrigin(projectUrl: string | null, origin: string | null) {
  if (!projectUrl || !origin) return false;
  try { return new URL(projectUrl).origin === new URL(origin).origin; } catch { return false; }
}