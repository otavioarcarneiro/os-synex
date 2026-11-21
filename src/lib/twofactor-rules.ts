// Regras puras do 2FA por e-mail da equipe interna (sem acesso a banco, e-mail ou rede).
export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODES_PER_CYCLE = 3; // 1 código inicial + 2 reenvios
export const CYCLE_WINDOW_MS = 30 * 60 * 1000;
export const HELP_REQUEST_WINDOW_MS = 30 * 60 * 1000;
export const MANUAL_RELEASE_MS = 30 * 60 * 1000;
export const STAFF_ROLES = ["owner", "partner", "admin"] as const;

export type TfState = {
  completedLogins: number;
  codeHash: string | null;
  codeExpiresAt: string | null;
  cycleStartedAt: string | null;
  codesSent: number;
  lastCodeSentAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  releaseRequestedAt: string | null;
  sacTicketId: string | null;
  manualReleaseUntil: string | null;
};

export const freshState = (): TfState => ({
  completedLogins: 0, codeHash: null, codeExpiresAt: null, cycleStartedAt: null, codesSent: 0, lastCodeSentAt: null,
  failedAttempts: 0, lockedUntil: null, releaseRequestedAt: null, sacTicketId: null, manualReleaseUntil: null,
});

export const isStaffRole = (roles: string[]) => roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
// 2FA só a partir do 2º acesso: o 1º acesso completo apenas registra o login.
export const requiresOtp = (isStaff: boolean, completedLogins: number) => isStaff && completedLogins >= 1;

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const iso = (t: number) => new Date(t).toISOString();

export function hasValidCode(s: TfState, now: number) {
  return !!s.codeHash && ms(s.codeExpiresAt) > now;
}

// Backoff do OTP: 3 erros -> aviso; 4º -> 2 min; 5º -> 5 min; 6º -> bloqueio administrativo indeterminado.
export type OtpLock = { warning: boolean; cooldownMinutes: number | null; adminLock: boolean };
export function otpLockAfterErrors(errors: number): OtpLock {
  if (errors >= 6) return { warning: false, cooldownMinutes: null, adminLock: true };
  if (errors === 5) return { warning: false, cooldownMinutes: 5, adminLock: false };
  if (errors === 4) return { warning: false, cooldownMinutes: 2, adminLock: false };
  if (errors === 3) return { warning: true, cooldownMinutes: null, adminLock: false };
  return { warning: false, cooldownMinutes: null, adminLock: false };
}

export function applyFailure(s: TfState, now: number, owner: boolean) {
  const failedAttempts = s.failedAttempts + 1;
  const decision = otpLockAfterErrors(failedAttempts);
  // O proprietário nunca fica em bloqueio indeterminado (é quem libera os demais): recebe o maior cooldown.
  const cooldownMinutes = decision.adminLock && owner ? 5 : decision.cooldownMinutes;
  const adminLock = decision.adminLock && !owner;
  const lockedUntil = cooldownMinutes ? iso(now + cooldownMinutes * 60000) : s.lockedUntil;
  return { patch: { failedAttempts, lockedUntil } as Partial<TfState>, warning: decision.warning, adminLock, cooldownMinutes, alertOwner: decision.adminLock };
}

export type SendDecision =
  | { kind: "send"; patch: Partial<TfState> }
  | { kind: "wait"; resendAt: string }
  | { kind: "limit"; retryAt: string };

// Decide se um novo código pode ser enviado: 60s entre envios e no máximo 3 códigos por ciclo.
export function decideSend(s: TfState, now: number): SendDecision {
  const cycleActive = !!s.cycleStartedAt && now - ms(s.cycleStartedAt) <= CYCLE_WINDOW_MS;
  const codesSent = cycleActive ? s.codesSent : 0;
  const cycleStartedAt = cycleActive ? (s.cycleStartedAt as string) : iso(now);
  if (codesSent >= MAX_CODES_PER_CYCLE) return { kind: "limit", retryAt: iso(ms(cycleStartedAt) + CYCLE_WINDOW_MS) };
  if (cycleActive && s.lastCodeSentAt && now - ms(s.lastCodeSentAt) < RESEND_COOLDOWN_MS) return { kind: "wait", resendAt: iso(ms(s.lastCodeSentAt) + RESEND_COOLDOWN_MS) };
  return { kind: "send", patch: { cycleStartedAt, codesSent: codesSent + 1, lastCodeSentAt: iso(now), codeExpiresAt: iso(now + OTP_TTL_MS) } };
}

export type OtpInfo = { resendAt: string; codesLeft: number; limitReached: boolean; expiresAt: string | null };
export function otpInfo(s: TfState, now: number): OtpInfo {
  const cycleActive = !!s.cycleStartedAt && now - ms(s.cycleStartedAt) <= CYCLE_WINDOW_MS;
  const codesSent = cycleActive ? s.codesSent : 0;
  const resendAt = cycleActive && s.lastCodeSentAt ? iso(ms(s.lastCodeSentAt) + RESEND_COOLDOWN_MS) : iso(now);
  return { resendAt, codesLeft: Math.max(0, MAX_CODES_PER_CYCLE - codesSent), limitReached: codesSent >= MAX_CODES_PER_CYCLE, expiresAt: hasValidCode(s, now) ? s.codeExpiresAt : null };
}

// Código de 6 dígitos com amostragem sem viés (rejeição) a partir de números aleatórios seguros.
export function generateOtp(): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return String(buf[0]! % 1_000_000).padStart(6, "0");
  }
}

export async function hashOtp(userId: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`synex-otp-v1:${userId}:${code}`));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Sessão obtida só por senha (sem link de convite/redefinição, sem OTP) não pode ser registrada por equipe do 2º acesso em diante.
export function isPasswordOnlyAmr(amr: unknown): boolean {
  if (!Array.isArray(amr) || amr.length === 0) return false;
  return amr.every((a) => (typeof a === "string" ? a : (a as { method?: string } | null)?.method) === "password");
}

export type TwoFactorResult =
  | ({ status: "otp_required"; sent: boolean } & OtpInfo)
  | ({ status: "otp_invalid"; reason: "wrong" | "expired"; warning: boolean } & OtpInfo)
  | { status: "otp_cooldown"; until: string }
  | { status: "admin_locked" }
  | { status: "help_sent" };
