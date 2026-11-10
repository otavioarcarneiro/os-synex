import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lockAfterFailures } from "./backoff";

export type LoginResult =
  | { status: "ok"; access_token: string; refresh_token: string; session_key: string }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "cooldown"; until: string }
  | { status: "admin_locked" }
  | { status: "blocked"; message: string };

export const secureLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<LoginResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publicClient, requestFingerprint, isOwnerEmail } = await import("./server-helpers.server");
    const email = data.email.toLowerCase();
    const owner = isOwnerEmail(email);
    const fp = requestFingerprint();

    const { data: sec } = await supabaseAdmin.from("login_security").select("*").eq("email", email).maybeSingle();
    if (sec?.admin_locked && !owner) return { status: "admin_locked" };
    if (sec?.locked_until && new Date(sec.locked_until) > new Date()) return { status: "cooldown", until: sec.locked_until };

    const client = publicClient();
    const { data: auth, error } = await client.auth.signInWithPassword({ email, password: data.password });

    if (error || !auth.session) {
      const failed = (sec?.failed_count ?? 0) + 1;
      const decision = lockAfterFailures(failed);
      const adminLock = decision.adminLock && !owner;
      const until = decision.cooldownMinutes ? new Date(Date.now() + decision.cooldownMinutes * 60000).toISOString() : null;
      await supabaseAdmin.from("login_security").upsert({
        email, failed_count: failed, locked_until: until, admin_locked: adminLock, updated_at: new Date().toISOString(),
      });
      if (adminLock) {
        const { data: prof } = await supabaseAdmin.from("profiles").select("full_name, phone").eq("email", email).maybeSingle();
        await supabaseAdmin.from("security_alerts").insert({
          email, full_name: prof?.full_name ?? null, phone: prof?.phone ?? null, ip: fp.ip, geo: fp.geo,
          device: fp.device, os: fp.os, browser: fp.browser, user_agent: fp.ua, attempts: failed,
        });
        return { status: "admin_locked" };
      }
      if (until) return { status: "cooldown", until };
      return { status: "invalid", attemptsLeft: Math.max(0, 3 - failed) };
    }

    const userId = auth.user.id;
    const { data: prof } = await supabaseAdmin.from("profiles").select("status").eq("id", userId).maybeSingle();
    if (prof && prof.status !== "active") {
      await client.auth.signOut();
      return { status: "blocked", message: prof.status === "suspended" ? "Sua conta está suspensa. Fale com a Synex." : "Esta conta foi desativada." };
    }
    if (!owner) {
      const { data: settings } = await supabaseAdmin.from("system_settings").select("maintenance_mode").eq("id", 1).single();
      if (settings?.maintenance_mode) {
        await client.auth.signOut();
        return { status: "blocked", message: "O Synex OS está em manutenção. Tente novamente em breve." };
      }
    }

    await supabaseAdmin.from("login_security").upsert({ email, failed_count: 0, locked_until: null, admin_locked: false, updated_at: new Date().toISOString() });
    const session_key = crypto.randomUUID();
    if (!owner) await supabaseAdmin.from("active_sessions").delete().eq("user_id", userId);
    await supabaseAdmin.from("active_sessions").insert({ user_id: userId, session_key, device: fp.device, os: fp.os, browser: fp.browser, ip: fp.ip });
    return { status: "ok", access_token: auth.session.access_token, refresh_token: auth.session.refresh_token, session_key };
  });

// Registra a sessão quando o usuário entra sem passar pelo formulário (ex.: link de redefinição/convite).
export const registerSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestFingerprint, isOwnerEmail } = await import("./server-helpers.server");
    const fp = requestFingerprint();
    const email = String(context.claims.email ?? "");
    const session_key = crypto.randomUUID();
    if (!isOwnerEmail(email)) await supabaseAdmin.from("active_sessions").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("active_sessions").insert({ user_id: context.userId, session_key, device: fp.device, os: fp.os, browser: fp.browser, ip: fp.ip });
    return { session_key };
  });

export const touchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase.from("active_sessions").select("id").eq("session_key", data.key).eq("user_id", context.userId).maybeSingle();
    const { data: prof } = await context.supabase.from("profiles").select("status").eq("id", context.userId).maybeSingle();
    return { valid: !!row && prof?.status === "active" };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255), origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publicClient, isOwnerEmail } = await import("./server-helpers.server");
    const email = data.email.toLowerCase();
    const redirectTo = new URL("/reset-password", data.origin).toString();
    const { data: sec } = await supabaseAdmin.from("login_security").select("admin_locked").eq("email", email).maybeSingle();
    if (sec?.admin_locked && !isOwnerEmail(email)) return { ok: false as const, message: "Conta em bloqueio administrativo. Contate a Synex pelo WhatsApp." };
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!prof && isOwnerEmail(email)) {
      // Primeiro acesso do proprietário: envia convite para definir a senha.
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: "Otávio" } });
      return { ok: true as const };
    }
    if (prof) await publicClient().auth.resetPasswordForEmail(email, { redirectTo });
    return { ok: true as const };
  });
