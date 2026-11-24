import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { monthlyFee } from "./pricing";
import { canRevokeOwnerSession } from "./access-rules";

type Ctx = { supabase: any; userId: string };
async function assertOwner(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (!data) throw new Error("Acesso restrito ao proprietário");
}
async function assertStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_staff", { _user_id: ctx.userId });
  if (!data) throw new Error("Acesso restrito à equipe");
}
const reason = z.string().trim().min(5, "Informe um motivo com pelo menos 5 caracteres").max(500);
const roleEnum = z.enum(["partner", "admin", "client"]);

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    email: z.string().trim().email().max(255), full_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).optional(), role: roleEnum,
    department: z.enum(["juridico", "execucao"]).nullable(), reason, origin: z.string().url(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isOwnerEmail } = await import("./server-helpers.server");
    if (isOwnerEmail(data.email)) throw new Error("E-mail proprietário é blindado");
    const { data: inv, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email.toLowerCase(), {
      redirectTo: new URL("/reset-password", data.origin).toString(), data: { full_name: data.full_name },
    });
    if (error || !inv.user) throw new Error(error?.message ?? "Falha ao convidar");
    const id = inv.user.id;
    await supabaseAdmin.from("profiles").upsert({ id, email: data.email.toLowerCase(), full_name: data.full_name, phone: data.phone ?? null, department: data.role === "admin" ? data.department : null });
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });
    await supabaseAdmin.from("audit_logs").insert({ actor_id: context.userId, target_id: id, action: "create", reason: data.reason, payload: { new: { email: data.email, role: data.role, department: data.department } } });
    return { id };
  });

export const userAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    targetId: z.string().uuid(), action: z.enum(["suspend", "reactivate", "delete", "role_change", "revoke_sessions"]),
    reason, role: roleEnum.optional(), department: z.enum(["juridico", "execucao"]).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isOwnerEmail } = await import("./server-helpers.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("*").eq("id", data.targetId).single();
    if (!prof) throw new Error("Usuário não encontrado");
    if (isOwnerEmail(prof.email) && data.action !== "revoke_sessions") throw new Error("Contas proprietárias são blindadas");
    if (data.action === "revoke_sessions" && !canRevokeOwnerSession(context.userId, data.targetId, !!(await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.targetId).eq("role", "owner").maybeSingle()).data)) throw new Error("Você só pode revogar os dispositivos do seu próprio perfil proprietário.");
    const { data: oldRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.targetId);
    let payload: Record<string, unknown> = { old: { status: prof.status, roles: oldRoles?.map((r) => r.role), department: prof.department } };

    if (data.action === "suspend" || data.action === "delete") {
      const status = data.action === "suspend" ? "suspended" : "deleted";
      await supabaseAdmin.from("profiles").update({ status, deleted_at: status === "deleted" ? new Date().toISOString() : null }).eq("id", data.targetId);
      await supabaseAdmin.auth.admin.updateUserById(data.targetId, { ban_duration: "876000h" });
      await supabaseAdmin.from("active_sessions").delete().eq("user_id", data.targetId);
      payload["new"] = { status };
    } else if (data.action === "reactivate") {
      await supabaseAdmin.from("profiles").update({ status: "active", deleted_at: null }).eq("id", data.targetId);
      await supabaseAdmin.auth.admin.updateUserById(data.targetId, { ban_duration: "none" });
      payload["new"] = { status: "active" };
    } else if (data.action === "role_change") {
      if (!data.role) throw new Error("Selecione o novo papel");
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetId);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.targetId, role: data.role });
      await supabaseAdmin.from("profiles").update({ department: data.role === "admin" ? data.department ?? null : null }).eq("id", data.targetId);
      payload["new"] = { role: data.role, department: data.department ?? null };
    } else {
      await supabaseAdmin.from("active_sessions").delete().eq("user_id", data.targetId);
      payload["new"] = { sessions: "revoked" };
    }
    await supabaseAdmin.from("audit_logs").insert({ actor_id: context.userId, target_id: data.targetId, action: data.action, reason: data.reason, payload: payload as never });
    return { ok: true };
  });

export const releaseLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ alertId: z.string().uuid(), reason }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: alert } = await supabaseAdmin.from("security_alerts").select("*").eq("id", data.alertId).single();
    if (!alert) throw new Error("Alerta não encontrado");
    if (alert.lock_scope === "origin") {
      const { error } = await supabaseAdmin.rpc("release_origin_login", {
        _alert_id: alert.id, _actor_id: context.userId, _reason: data.reason,
      });
      if (error) throw new Error("Não foi possível liberar a origem bloqueada.");
      return { ok: true };
    }
    await supabaseAdmin.from("login_security").upsert({ email: alert.email, failed_count: 0, locked_until: null, admin_locked: false, updated_at: new Date().toISOString() });
    await supabaseAdmin.from("security_alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("email", alert.email).eq("lock_scope", "account").eq("resolved", false);
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", alert.email).maybeSingle();
    // Bloqueio por erros no OTP: zera contadores do 2FA (best-effort; tabela pode ainda não existir).
    if (prof?.id) await (supabaseAdmin as any).from("staff_two_factor").update({ failed_attempts: 0, locked_until: null, code_hash: null, code_expires_at: null, updated_at: new Date().toISOString() }).eq("user_id", prof.id);
    await supabaseAdmin.from("audit_logs").insert({ actor_id: context.userId, target_id: prof?.id ?? null, action: "unlock", reason: data.reason, payload: { email: alert.email, ip: alert.ip } });
    return { ok: true };
  });

// Área Restrita: revalida senha + PIN mestre
export const sudoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("system_settings").select("master_pin_hash").eq("id", 1).single();
    return { hasPin: !!data?.master_pin_hash };
  });

async function checkPassword(email: string, password: string) {
  const { publicClient } = await import("./server-helpers.server");
  const { error } = await publicClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error("Senha incorreta");
}
const pinSchema = z.string().regex(/^\d{4,8}$/, "O PIN deve ter de 4 a 8 dígitos");

async function pinGate(admin: any, userId: string) {
  const { data } = await admin.from("pin_attempts").select("failed_count,locked_until").eq("user_id", userId).maybeSingle();
  if (data?.locked_until && new Date(data.locked_until) > new Date()) throw new Error("PIN bloqueado após 3 erros. Tente novamente em alguns minutos.");
  return data?.failed_count ?? 0;
}
async function pinResult(admin: any, userId: string, prev: number, ok: boolean) {
  const { pinAfterFailure } = await import("./pin-lock");
  const next = ok ? { failed: 0, lockedUntil: null } : pinAfterFailure(prev);
  await admin.from("pin_attempts").upsert({ user_id: userId, failed_count: next.failed, locked_until: next.lockedUntil, updated_at: new Date().toISOString() });
  if (!ok && next.lockedUntil) await admin.from("audit_logs").insert({ actor_id: userId, target_id: userId, action: "pin_locked", reason: "3 erros consecutivos no PIN mestre", payload: {} });
}

export const verifySudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200), pin: pinSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256 } = await import("./server-helpers.server");
    await checkPassword(String(context.claims.email), data.password);
    const { data: s } = await supabaseAdmin.from("system_settings").select("master_pin_hash").eq("id", 1).single();
    if (!s?.master_pin_hash) {
      const salt = crypto.randomUUID();
      await supabaseAdmin.from("system_settings").update({ master_pin_hash: `${salt}:${await sha256(salt + data.pin)}` }).eq("id", 1);
      return { ok: true, created: true };
    }
    const [salt, hash] = s.master_pin_hash.split(":");
    const prev = await pinGate(supabaseAdmin, context.userId);
    const ok = (await sha256(salt + data.pin)) === hash;
    await pinResult(supabaseAdmin, context.userId, prev, ok);
    if (!ok) throw new Error("PIN mestre incorreto");
    return { ok: true, created: false };
  });

export const changePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200), currentPin: pinSchema, newPin: pinSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256 } = await import("./server-helpers.server");
    await checkPassword(String(context.claims.email), data.password);
    const { data: s } = await supabaseAdmin.from("system_settings").select("master_pin_hash").eq("id", 1).single();
    const [salt, hash] = (s?.master_pin_hash ?? ":").split(":");
    const prev = await pinGate(supabaseAdmin, context.userId);
    const ok = (await sha256(salt + data.currentPin)) === hash;
    await pinResult(supabaseAdmin, context.userId, prev, ok);
    if (!ok) throw new Error("PIN atual incorreto");
    const ns = crypto.randomUUID();
    await supabaseAdmin.from("system_settings").update({ master_pin_hash: `${ns}:${await sha256(ns + data.newPin)}` }).eq("id", 1);
    await supabaseAdmin.from("audit_logs").insert({ actor_id: context.userId, target_id: context.userId, action: "pin_change", reason: "Alteração do PIN mestre pelo proprietário", payload: {} });
    return { ok: true };
  });

export const checkUptimeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    let query = context.supabase.from("projects").select("id").eq("kind", "site");
    if (data.projectId) query = query.eq("id", data.projectId);
    const { data: projects, error } = await query;
    if (error || (data.projectId && !projects?.length)) throw new Error("Projeto indisponível para este acesso.");
    const { runUptimeCheck } = await import("./uptime.server");
    return runUptimeCheck((projects ?? []).map((project) => project.id));
  });

// Teste de conexão com o UptimeRobot (somente proprietário). Nunca retorna chave, headers ou corpo bruto.
const UPTIMEROBOT_SAFE_MESSAGES: Record<string, string> = {
  missing_key: "Chave da API do UptimeRobot não configurada.",
  timeout: "O UptimeRobot demorou para responder. Tente novamente.",
  network: "Não foi possível alcançar o UptimeRobot. Tente novamente.",
  unauthorized: "A chave da API do UptimeRobot foi recusada.",
  rate_limited: "Limite de requisições do UptimeRobot atingido. Aguarde um minuto e tente novamente.",
  http_error: "O UptimeRobot retornou um erro. Tente novamente.",
  invalid_response: "Resposta inválida do UptimeRobot.",
};
export const testUptimeRobotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { listMonitors, UptimeRobotError } = await import("@/lib/uptimerobot.server");
    try {
      const page = await listMonitors();
      return { ok: true as const, monitorCount: page.data.length };
    } catch (e) {
      const code = e instanceof UptimeRobotError ? e.code : "unknown";
      console.error("[uptimerobot] teste de conexão falhou:", code);
      throw new Error(UPTIMEROBOT_SAFE_MESSAGES[code] ?? "Falha ao conectar ao UptimeRobot.");
    }
  });
// Sincronização manual dos monitores externos (somente proprietário).
export const syncUptimeRobotNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);

    const { UptimeRobotError } = await import("@/lib/uptimerobot.server");
    const { syncUptimeFromUptimeRobot } = await import("./uptime-sync.server");

    try {
      return await syncUptimeFromUptimeRobot();
    } catch (e) {
      const code = e instanceof UptimeRobotError ? e.code : "unknown";

      console.error("[uptimerobot] sincronização manual falhou:", code);

      throw new Error(
        UPTIMEROBOT_SAFE_MESSAGES[code] ??
          "Não foi possível sincronizar os monitores do UptimeRobot.",
      );
    }
  });
// Financeiro
export const generateMonthInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const { data: projects } = await supabaseAdmin.from("projects").select("id, contract_start").eq("billing_enabled", true);
    let created = 0;
    for (const p of projects ?? []) {
      const day = Math.min(28, new Date(p.contract_start + "T12:00:00").getDate());
      const due = new Date(now.getFullYear(), now.getMonth(), day).toISOString().slice(0, 10);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { count } = await supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).eq("project_id", p.id).gte("due_date", monthStart).lte("due_date", monthEnd);
      if (count) continue;
      await supabaseAdmin.from("invoices").insert({ project_id: p.id, amount: monthlyFee(p.contract_start, now), due_date: due });
      created++;
    }
    return { created };
  });

// Agradecimento automático após a baixa manual do pagamento (somente proprietário).
export const notifyInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { sendPaymentThanks } = await import("./billing.server");
    return { sent: await sendPaymentThanks(data.invoiceId) };
  });

// Cobrança manual imediata de uma fatura pendente (somente proprietário).
export const sendInvoiceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { sendInvoiceManually } = await import("./billing.server");
    return { sent: await sendInvoiceManually(data.invoiceId) };
  });

// Pedidos de liberação do 2FA ("Não tenho acesso ao e-mail") ainda pendentes (somente proprietário).
export const listTwoFactorRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data, error } = await db.from("staff_two_factor").select("user_id,sac_ticket_id,release_requested_at").not("release_requested_at", "is", null).is("manual_release_until", null);
    if (error || !data?.length) return [] as { userId: string; ticketId: string | null; requestedAt: string }[];
    return data.map((r: { user_id: string; sac_ticket_id: string | null; release_requested_at: string }) => ({ userId: r.user_id, ticketId: r.sac_ticket_id, requestedAt: r.release_requested_at }));
  });

// Liberação manual: dispensa o código uma única vez, por 30 minutos; a senha continua exigida.
export const releaseTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MANUAL_RELEASE_MS } = await import("./twofactor-rules");
    const db = supabaseAdmin as any;
    const { data: row, error } = await db.from("staff_two_factor").select("sac_ticket_id,release_requested_at").eq("user_id", data.userId).maybeSingle();
    if (error || !row?.release_requested_at) throw new Error("Não há pedido de liberação pendente para este colaborador.");
    const now = Date.now();
    const { error: upErr } = await db.from("staff_two_factor").update({
      manual_release_until: new Date(now + MANUAL_RELEASE_MS).toISOString(), release_requested_at: null,
      failed_attempts: 0, locked_until: null, code_hash: null, code_expires_at: null, updated_at: new Date(now).toISOString(),
    }).eq("user_id", data.userId);
    if (upErr) throw new Error("Não foi possível liberar o acesso.");
    if (row.sac_ticket_id) {
      await supabaseAdmin.from("support_messages").insert({ ticket_id: row.sac_ticket_id, role: "assistant", body: "Acesso liberado pelo Proprietário. Faça login novamente: a verificação por e-mail será dispensada uma vez nos próximos 30 minutos." });
      await supabaseAdmin.from("support_tickets").update({ status: "closed" }).eq("id", row.sac_ticket_id);
    }
    await supabaseAdmin.from("audit_logs").insert({ actor_id: context.userId, target_id: data.userId, action: "unlock", reason: "Liberação manual do 2FA pelo Proprietário", payload: { kind: "2fa" } });
    return { ok: true };
  });
