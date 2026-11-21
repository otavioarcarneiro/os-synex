// 2FA por e-mail da equipe interna: orquestração (servidor apenas). Regras puras em ./twofactor-rules.
import {
  HELP_REQUEST_WINDOW_MS, applyFailure, decideSend, freshState, generateOtp, hasValidCode, hashOtp, isStaffRole,
  otpInfo, requiresOtp, safeEqual, type TfState, type TwoFactorResult,
} from "./twofactor-rules";

export type Fingerprint = { ip?: string; device?: string; os?: string; browser?: string };
export type GateCtx = { userId: string; email: string; owner: boolean; action: "login" | "resend" | "no_email"; otp?: string; fp: Fingerprint };

export interface TfRepo {
  roles(userId: string): Promise<string[]>;
  load(userId: string): Promise<{ state: TfState } | { missing: true }>;
  save(userId: string, patch: Partial<TfState>): Promise<void>;
  claimCode(userId: string, expectedHash: string, patch: Partial<TfState>): Promise<boolean>;
  bumpFailure(userId: string, current: number, patch: Partial<TfState>): Promise<boolean>;
  profile(userId: string): Promise<{ name: string | null; email: string }>;
  createSacTicket(userId: string, message: string): Promise<string>;
  adminLock(p: { email: string; fullName: string | null; attempts: number; fp: Fingerprint }): Promise<void>;
}
export type GateDeps = {
  repo: TfRepo; now: () => number; genCode: () => string;
  sendOtp: (to: string, code: string) => Promise<void>;
  sendHelp: (p: { name: string | null; email: string; fp: Fingerprint }) => Promise<void>;
  alertLock: (p: { email: string } & Fingerprint) => Promise<void>;
};

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const iso = (t: number) => new Date(t).toISOString();
const expired = (s: TfState, now: number): TwoFactorResult => ({ status: "otp_invalid", reason: "expired", warning: false, ...otpInfo(s, now) });

// Retorna null quando o login pode seguir; caso contrário, o resultado que o cliente deve exibir (sem tokens).
export async function twoFactorGate(ctx: GateCtx, d: GateDeps): Promise<TwoFactorResult | null> {
  const roles = await d.repo.roles(ctx.userId);
  if (!isStaffRole(roles)) return null;
  const loaded = await d.repo.load(ctx.userId);
  if ("missing" in loaded) { console.warn("2FA: tabela staff_two_factor ainda não existe; login segue sem 2FA."); return null; }
  const s = loaded.state;
  const now = d.now();

  if (!requiresOtp(true, s.completedLogins)) { await d.repo.save(ctx.userId, { completedLogins: s.completedLogins + 1 }); return null; }
  if (ms(s.manualReleaseUntil) > now) {
    await d.repo.save(ctx.userId, { manualReleaseUntil: null, failedAttempts: 0, lockedUntil: null, codeHash: null, codeExpiresAt: null, completedLogins: s.completedLogins + 1 });
    return null;
  }
  if (ms(s.lockedUntil) > now) return { status: "otp_cooldown", until: s.lockedUntil as string };
  if (ctx.action === "no_email") return helpRequest(ctx, d, s, now);
  if (ctx.otp) return verify(ctx, d, s, now);
  return issue(ctx, d, s, now, ctx.action === "resend");
}

async function issue(ctx: GateCtx, d: GateDeps, s: TfState, now: number, force: boolean): Promise<TwoFactorResult> {
  if (!force && hasValidCode(s, now)) return { status: "otp_required", sent: false, ...otpInfo(s, now) };
  const decision = decideSend(s, now);
  if (decision.kind !== "send") return { status: "otp_required", sent: false, ...otpInfo(s, now) };
  const code = d.genCode();
  const patch = { ...decision.patch, codeHash: await hashOtp(ctx.userId, code) };
  await d.repo.save(ctx.userId, patch);
  try { await d.sendOtp(ctx.email, code); }
  catch (e) {
    console.error("2FA: falha ao enviar o código", e);
    // Não consome a cota do ciclo se o e-mail não saiu.
    await d.repo.save(ctx.userId, { codeHash: s.codeHash, codeExpiresAt: s.codeExpiresAt, cycleStartedAt: s.cycleStartedAt, codesSent: s.codesSent, lastCodeSentAt: s.lastCodeSentAt });
    throw new Error("Não foi possível enviar o código de verificação. Tente novamente em instantes.");
  }
  return { status: "otp_required", sent: true, ...otpInfo({ ...s, ...patch }, now) };
}

async function verify(ctx: GateCtx, d: GateDeps, first: TfState, now: number): Promise<TwoFactorResult | null> {
  let s = first;
  const given = await hashOtp(ctx.userId, ctx.otp as string);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!hasValidCode(s, now)) return expired(s, now);
    const expectedHash = s.codeHash as string;
    if (safeEqual(given, expectedHash)) {
      const claimed = await d.repo.claimCode(ctx.userId, expectedHash, {
        codeHash: null, codeExpiresAt: null, cycleStartedAt: null, codesSent: 0, lastCodeSentAt: null, failedAttempts: 0, lockedUntil: null,
        releaseRequestedAt: null, manualReleaseUntil: null, completedLogins: s.completedLogins + 1,
      });
      return claimed ? null : expired(s, now); // código de uso único
    }
    const f = applyFailure(s, now, ctx.owner);
    if (await d.repo.bumpFailure(ctx.userId, s.failedAttempts, f.patch)) {
      if (f.adminLock) {
        const prof = await d.repo.profile(ctx.userId);
        await d.repo.adminLock({ email: ctx.email, fullName: prof.name, attempts: f.patch.failedAttempts ?? 6, fp: ctx.fp });
        try { await d.alertLock({ email: ctx.email, ...ctx.fp }); } catch (e) { console.error(e); }
        return { status: "admin_locked" };
      }
      if (f.cooldownMinutes) return { status: "otp_cooldown", until: f.patch.lockedUntil as string };
      return { status: "otp_invalid", reason: "wrong", warning: f.warning, ...otpInfo(s, now) };
    }
    // Outra requisição alterou o contador: relê e tenta de novo (contagem atômica por otimismo).
    const reloaded = await d.repo.load(ctx.userId);
    if ("missing" in reloaded) return expired(s, now);
    s = reloaded.state;
    if (ms(s.lockedUntil) > now) return { status: "otp_cooldown", until: s.lockedUntil as string };
  }
  throw new Error("Não foi possível validar o código agora. Tente novamente.");
}

// "Não tenho acesso ao e-mail": abre demanda no SAC (aparece na Central) e avisa o Proprietário.
async function helpRequest(ctx: GateCtx, d: GateDeps, s: TfState, now: number): Promise<TwoFactorResult> {
  if (s.releaseRequestedAt && now - ms(s.releaseRequestedAt) < HELP_REQUEST_WINDOW_MS) return { status: "help_sent" };
  const prof = await d.repo.profile(ctx.userId);
  const where = [ctx.fp.ip && `IP ${ctx.fp.ip}`, [ctx.fp.device, ctx.fp.os, ctx.fp.browser].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  const ticketId = await d.repo.createSacTicket(ctx.userId, `Solicitação de liberação do 2FA: ${prof.name || prof.email} informou que não tem acesso ao e-mail cadastrado.${where ? ` Origem: ${where}.` : ""}`);
  await d.repo.save(ctx.userId, { releaseRequestedAt: iso(now), sacTicketId: ticketId });
  try { await d.sendHelp({ name: prof.name, email: prof.email, fp: ctx.fp }); } catch (e) { console.error("2FA: falha ao avisar o Proprietário por e-mail", e); }
  return { status: "help_sent" };
}

// ---- Implementação com Supabase (supabaseAdmin; a tabela é só do servidor, sem políticas para o navegador) ----
const COLS: Record<keyof TfState, string> = {
  completedLogins: "completed_logins", codeHash: "code_hash", codeExpiresAt: "code_expires_at", cycleStartedAt: "cycle_started_at",
  codesSent: "codes_sent", lastCodeSentAt: "last_code_sent_at", failedAttempts: "failed_attempts", lockedUntil: "locked_until",
  releaseRequestedAt: "release_requested_at", sacTicketId: "sac_ticket_id", manualReleaseUntil: "manual_release_until",
};
const toRow = (patch: Partial<TfState>) => Object.fromEntries(Object.entries(patch).map(([k, v]) => [COLS[k as keyof TfState], v]));
const fromRow = (r: Record<string, unknown>): TfState => {
  const out = freshState() as Record<string, unknown>;
  for (const [k, col] of Object.entries(COLS)) if (r[col] !== undefined) out[k] = r[col];
  return out as TfState;
};
export const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || (/staff_two_factor/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? "")));

export function supabaseRepo(db: any): TfRepo {
  const tf = () => db.from("staff_two_factor");
  return {
    async roles(userId) {
      const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw new Error("Não foi possível validar o perfil de acesso.");
      return (data ?? []).map((r: { role: string }) => r.role);
    },
    async load(userId) {
      const { data, error } = await tf().select("*").eq("user_id", userId).maybeSingle();
      if (error) { if (isMissingTable(error)) return { missing: true as const }; throw new Error("Não foi possível validar a verificação em duas etapas."); }
      return { state: data ? fromRow(data) : freshState() };
    },
    async save(userId, patch) {
      const { error } = await tf().upsert({ user_id: userId, ...toRow(patch), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw new Error("Não foi possível registrar a verificação em duas etapas.");
    },
    async claimCode(userId, expectedHash, patch) {
      const { data, error } = await tf().update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("code_hash", expectedHash).select("user_id");
      if (error) throw new Error("Não foi possível validar o código.");
      return (data ?? []).length > 0;
    },
    async bumpFailure(userId, current, patch) {
      const { data, error } = await tf().update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("failed_attempts", current).select("user_id");
      if (error) throw new Error("Não foi possível registrar a tentativa.");
      return (data ?? []).length > 0;
    },
    async profile(userId) {
      const { data } = await db.from("profiles").select("full_name,email").eq("id", userId).maybeSingle();
      return { name: data?.full_name ?? null, email: data?.email ?? "" };
    },
    async createSacTicket(userId, message) {
      const { data, error } = await db.from("support_tickets").insert({ client_id: userId, status: "human" }).select("id").single();
      if (error || !data) throw new Error("Não foi possível abrir a demanda no SAC.");
      await db.from("support_messages").insert({ ticket_id: data.id, role: "user", body: message });
      return data.id as string;
    },
    async adminLock({ email, fullName, attempts, fp }) {
      await db.from("login_security").upsert({ email, admin_locked: true, updated_at: new Date().toISOString() });
      await db.from("security_alerts").insert({ email, full_name: fullName, attempts, lock_scope: "account", ip: fp.ip ?? null, device: fp.device ?? null, os: fp.os ?? null, browser: fp.browser ?? null });
    },
  };
}

export async function productionDeps(): Promise<GateDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mail = await import("./email.server");
  return {
    repo: supabaseRepo(supabaseAdmin), now: Date.now, genCode: generateOtp,
    sendOtp: mail.sendOtpEmail, sendHelp: mail.sendTwoFactorHelpEmail, alertLock: mail.sendLockAlert,
  };
}
