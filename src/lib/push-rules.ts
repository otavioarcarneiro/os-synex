// Regras de envio de notificações no aparelho (puras, testáveis).
export const VAPID_PUBLIC_KEY = "BHKtODQtXV1x8mKROG9Ivc9mXI8g_8Rxncbtp3XOLRYxBW24Xc2pshb-Y0pAP9wXJEva9Np-ok-s7PgzCFww9Ic";
export type PushEvent = "uptime_down" | "uptime_up" | "sac" | "login_lock" | "invoice_paid";

// Todos os avisos desta etapa vão somente para Proprietários.
export function pushRecipients(rows: { user_id: string; role: string }[]): string[] {
  return [...new Set(rows.filter((r) => r.role === "owner").map((r) => r.user_id))];
}

// Equipe interna vê o convite de instalação; cliente não.
export function canSeeInstallPrompt(role: string | null): boolean {
  return role === "owner" || role === "partner" || role === "admin";
}

// Inscrição expirada/removida pelo navegador deve ser apagada.
export function isGoneStatus(status: number): boolean {
  return status === 404 || status === 410;
}
