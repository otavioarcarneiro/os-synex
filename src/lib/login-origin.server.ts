import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LoginResult } from "./auth.functions";
import { sha256 } from "./server-helpers.server";

type OriginResult = Exclude<LoginResult, { status: "ok" } | { status: "blocked" }> | { status: "allowed" };
type Attempt = { key: string; token: string; result: OriginResult };

// The edge replaces CF-Connecting-IP. Never accept X-Forwarded-For, browser
// fingerprints, or an input email as authority for an origin penalty.
export async function beginOriginLogin(client: SupabaseClient<Database>): Promise<Attempt> {
  const request = getRequest();
  const ip = request.headers.get("cf-connecting-ip");
  const hostname = new URL(request.url).hostname;
  if (!ip && hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error("Não foi possível validar a origem do acesso.");
  }
  const key = await sha256(`synex-login-origin-v1:${ip ?? "local-preview"}`);
  const token = crypto.randomUUID();
  const { data, error } = await client.rpc("begin_origin_login", { _key: key, _token: token });
  if (error || !data) throw new Error("Não foi possível validar a segurança do acesso.");
  return { key, token, result: data as OriginResult };
}

export async function finishOriginLogin(
  client: SupabaseClient<Database>, attempt: Attempt, success: boolean,
  email: string, fingerprint: Record<string, string>,
): Promise<Exclude<LoginResult, { status: "ok" } | { status: "blocked" }> | { status: "ok" }> {
  const { data, error } = await client.rpc("finish_origin_login", {
    _key: attempt.key, _token: attempt.token, _success: success, _email: email, _fingerprint: fingerprint,
  });
  if (error || !data) throw new Error("Não foi possível registrar a segurança do acesso.");
  return data as Exclude<LoginResult, { status: "ok" } | { status: "blocked" }> | { status: "ok" };
}