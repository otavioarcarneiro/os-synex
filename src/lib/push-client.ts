import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY } from "./push-rules";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const toKey = (s: string): Uint8Array<ArrayBuffer> => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações. No iPhone, instale o app na tela inicial primeiro.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificações negada no navegador.");
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON();
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.["p256dh"] ?? "", auth: j.keys?.["auth"] ?? "" });
  if (error) throw new Error("Não foi possível salvar este aparelho.");
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

// Service worker só no app publicado: nunca em preview, iframe ou desenvolvimento.
export function swAllowed() {
  if (!import.meta.env.PROD) return false;
  try { if (window.self !== window.top) return false; } catch { return false; }
  const h = window.location.hostname.toLowerCase();
  if (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--/.test(h)) return false;
  if (/^project--.+-dev\./.test(h)) return false;
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(h) || /(^|\.)beta\.lovable\.dev$/.test(h)) return false;
  return !new URLSearchParams(window.location.search).has("sw");
}
