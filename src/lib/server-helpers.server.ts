import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";
import { parseUserAgent } from "./device";

export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export function requestFingerprint() {
  const req = getRequest();
  const h = req.headers;
  const ua = h.get("user-agent") ?? "";
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const geo = [h.get("cf-ipcity"), h.get("cf-region"), h.get("cf-ipcountry")].filter(Boolean).join(", ") || "Não disponível";
  return { ip, geo, ua, ...parseUserAgent(ua) };
}

export function isOwnerEmail(email: string) {
  return ["otavio.arcarneiro@gmail.com", "synex.presence@gmail.com"].includes(email.trim().toLowerCase());
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
