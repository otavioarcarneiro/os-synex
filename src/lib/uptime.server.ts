import ipaddr from "ipaddr.js";
import type { LookupFunction } from "node:net";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10000;

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    // Reject mapped IPv4, NAT64, 6to4, Teredo, link-local, multicast and all
    // other special-use ranges, even when an embedded IPv4 appears public.
    if (parsed.kind() === "ipv6") {
      return parsed.range() === "unicast" && ipaddr.subnetMatch(parsed, {
        global: [ipaddr.parse("2000::"), 3],
      }, "other") === "global";
    }
    return parsed.range() === "unicast";
  } catch { return false; }
}

export function validateUptimeUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || value.length > 2048) {
    throw new Error("Destino de monitoramento inválido.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Destino interno não permitido.");
  } else if (!hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname)
    || hostname === "metadata.google.internal" || hostname === "metadata.goog") {
    throw new Error("Destino interno não permitido.");
  }
  url.hostname = url.hostname.startsWith("[") ? `[${hostname}]` : hostname;
  url.hash = "";
  return url;
}

export async function resolvePublicAddresses(url: URL, signal: AbortSignal): Promise<string[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(hostname)) return [hostname];
  // Fixed resolver URL; never send credentials, project data or request headers.
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", hostname);
    endpoint.searchParams.set("type", type);
    const response = await fetch(endpoint, { headers: { accept: "application/dns-json" }, redirect: "error", signal });
    if (!response.ok) throw new Error("Não foi possível validar o destino.");
    const text = await readBounded(response, 16384);
    const result = JSON.parse(text) as { Status: number; Answer?: { type: number; data: string }[] };
    if (![0, 3].includes(result.Status)) throw new Error("Não foi possível validar o destino.");
    return (result.Answer ?? []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) throw new Error("Destino interno ou indisponível.");
  return addresses;
}

async function readBounded(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resposta inválida.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Resposta excede o limite.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

type Probe = { status: number; location: string | null };
export type UptimeTransport = (url: URL, addresses: string[], signal: AbortSignal) => Promise<Probe>;

export function pinLookup(address: string): LookupFunction {
  const family = ipaddr.parse(address).kind() === "ipv4" ? 4 : 6;
  return (_hostname, options, callback) => {
    // Node 22 may request every address (`all: true`) even for one pinned IP.
    // Its callback then expects LookupAddress[], not a string plus family.
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function isWorkersRuntime(): boolean {
  const g = globalThis as { WebSocketPair?: unknown; navigator?: { userAgent?: string } };
  return typeof g.WebSocketPair !== "undefined" || g.navigator?.userAgent === "Cloudflare-Workers";
}

async function requestPublicSite(url: URL, addresses: string[], signal: AbortSignal): Promise<Probe> {
  if (isWorkersRuntime()) {
    // Workers' outbound proxy validates the actual connection destination,
    // blocking internal network services even if DNS changes after preflight.
    // Do not use resolveOverride: it is silently ignored outside the zone.
    // https://developers.cloudflare.com/workers/reference/security-model/
    const response = await fetch(url, {
      method: "HEAD", redirect: "manual", signal, credentials: "omit",
      headers: { "user-agent": "Synex-Uptime/1.0", accept: "*/*" },
    });
    await response.body?.cancel();
    return { status: response.status, location: response.headers.get("location") };
  }
  // The local Node preview lacks the Workers egress proxy. Pin its connection
  // to the validated IP, retaining original Host and TLS certificate/SNI checks.
  const transport = url.protocol === "https:" ? await import("node:https") : await import("node:http");
  return new Promise((resolve, reject) => {
    const address = addresses[0];
    if (!address) { reject(new Error("No validated address")); return; }
    const req = transport.request(url, {
      method: "HEAD", signal, agent: false, maxHeaderSize: 16384,
      headers: { "user-agent": "Synex-Uptime/1.0", accept: "*/*" },
      lookup: pinLookup(address),
    }, (response) => {
      resolve({ status: response.statusCode ?? 500, location: response.headers.location ?? null });
      response.destroy();
    });
    req.on("error", reject);
    req.end();
  });
}

export async function probePublicSite(
  value: string,
  resolveAddresses = resolvePublicAddresses,
  transport: UptimeTransport = requestPublicSite,
): Promise<number> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = validateUptimeUrl(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    signal.throwIfAborted();
    const addresses = await resolveAddresses(url, signal);
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) throw new Error("Destino interno não permitido.");
    const response = await transport(url, addresses, signal);
    if (!REDIRECTS.has(response.status)) return response.status;
    if (!response.location || redirects === MAX_REDIRECTS) throw new Error("Redirecionamento inválido.");
    url = validateUptimeUrl(new URL(response.location, url).href);
  }
  throw new Error("Limite de redirecionamentos excedido.");
}

export async function runUptimeCheck(projectIds?: string[]) {
  if (projectIds && projectIds.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("projects").select("id,url,name,uptime_status").eq("kind", "site").not("url", "is", null);
  if (projectIds) query = query.in("id", projectIds);
  const { data: projects, error } = await query;
  if (error) throw new Error("Não foi possível consultar o monitoramento.");
  const results: { id: string; status: "online" | "warning" | "down" }[] = [];
  // Sequential requests keep concurrency bounded; HEAD never downloads pages.
  for (const project of projects ?? []) {
    const token = crypto.randomUUID();
    const { data: acquired, error: leaseError } = await supabaseAdmin.rpc("acquire_uptime_probe", { _project: project.id, _token: token });
    if (leaseError) throw new Error("Não foi possível iniciar o monitoramento.");
    if (!acquired) continue;
    const started = Date.now();
    let status: "online" | "warning" | "down" = "down";
    // Two attempts: a site is only marked down if both fail (avoids false alarms).
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const code = await probePublicSite(project.url!);
        status = code < 400 ? (Date.now() - t0 > 3000 ? "warning" : "online") : code < 500 ? "warning" : "down";
      } catch (e) { status = "down"; console.error(`Uptime probe falhou (${project.id}):`, e instanceof Error ? e.message : e); }
      // Retry only fast failures so both attempts fit inside the 20s probe lease.
      if (status !== "down" || attempt === 1 || Date.now() - t0 > 6000) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const { data: recorded, error: updateError } = await supabaseAdmin.rpc("finish_uptime_probe", {
      _project: project.id, _token: token, _status: status, _latency: Date.now() - started,
    });
    if (updateError) throw new Error("Não foi possível registrar o monitoramento.");
    if (recorded) results.push({ id: project.id, status });
    // Alerta só na transição para queda, evitando e-mails repetidos a cada checagem.
    if (recorded && status === "down" && project.uptime_status !== "down") {
      try { const { sendDownAlert } = await import("./email.server"); await sendDownAlert(project); } catch (e) { console.error(e); }
    }
  }
  return results;
}