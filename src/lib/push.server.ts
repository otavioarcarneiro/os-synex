// Envio Web Push (VAPID + aes128gcm) usando apenas Web Crypto — compatível com Workers.
import { VAPID_PUBLIC_KEY, pushRecipients, isGoneStatus, type PushEvent } from "./push-rules";

const enc = new TextEncoder();
const b64uDecode = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64uEncode = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const concat = (...a: Uint8Array[]): Uint8Array<ArrayBuffer> => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

async function encrypt(payload: string, p256dh: string, auth: string) {
  const uaPub = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65;
  return concat(header, asPub, ct);
}

async function vapidAuth(endpoint: string) {
  const d = process.env["VAPID_PRIVATE_D"];
  if (!d) throw new Error("Chave de notificações não configurada");
  const pub = b64uDecode(VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:synex.presence@gmail.com" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

// Nunca lança: falha de notificação não pode bloquear a ação principal.
export async function pushToOwners(event: PushEvent, msg: { title: string; body: string; url: string }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "owner");
    const ids = pushRecipients((roles ?? []) as { user_id: string; role: string }[]);
    if (!ids.length) return;
    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids).limit(50);
    const payload = JSON.stringify({ ...msg, tag: event });
    await Promise.allSettled((subs ?? []).map(async (s) => {
      const res = await fetch(s.endpoint, {
        method: "POST",
        headers: { Authorization: await vapidAuth(s.endpoint), TTL: "86400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" },
        body: await encrypt(payload, s.p256dh, s.auth),
      });
      if (isGoneStatus(res.status)) await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
      else if (!res.ok) console.error(`Push falhou [${res.status}]: ${await res.text()}`);
    }));
  } catch (e) { console.error("Push:", e); }
}
