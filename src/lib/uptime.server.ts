import ipaddr from "ipaddr.js";
import type { LookupFunction } from "node:net";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10000;
// Orçamento total por site: precisa caber no lease de 20s de acquire_uptime_probe.
const PROBE_BUDGET_MS = 18000;
const RETRY_DELAY_MS = 2000;
const SLOW_MS = 3000;

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
  return typeof g.WebSocketPair !== "undefined" || (g.navigator?.userAgent ?? "").startsWith("Cloudflare");
}

async function fetchProbe(url: URL, signal: AbortSignal, method: "HEAD" | "GET"): Promise<Probe> {
  const response = await fetch(url, {
    method, redirect: "manual", signal, credentials: "omit",
    headers: { "user-agent": "Mozilla/5.0 (compatible; Synex-Uptime/1.0)", accept: "*/*" },
  });
  await response.body?.cancel().catch(() => {});
  return { status: response.status, location: response.headers.get("location") };
}

async function requestPublicSite(url: URL, addresses: string[], signal: AbortSignal): Promise<Probe> {
  const first = await requestOnce(url, addresses, signal);
  // Some servers reject HEAD (403/405/501); confirm with a GET before judging.
  if ([403, 405, 501].includes(first.status)) return fetchProbe(url, signal, "GET");
  return first;
}

async function requestOnce(url: URL, addresses: string[], signal: AbortSignal): Promise<Probe> {
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
  try { return await nodePinned(url, addresses, signal); }
  catch (e) {
    // Runtime without working node sockets (published edge): Workers' egress
    // proxy enforces destinations, so standard fetch is the safe fallback.
    if (signal.aborted) throw e;
    return fetchProbe(url, signal, "HEAD");
  }
}

async function nodePinned(url: URL, addresses: string[], signal: AbortSignal): Promise<Probe> {
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
  timeoutMs = TIMEOUT_MS,
): Promise<number> {
  const signal = AbortSignal.timeout(timeoutMs);
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

export type SiteStatus = "online" | "warning" | "down";

// 2xx/3xx: online (warning se lento); 4xx: warning (o site respondeu); 5xx: down.
export function classifyStatusCode(code: number, elapsedMs: number): SiteStatus {
  if (code < 400) return elapsedMs > SLOW_MS ? "warning" : "online";
  return code < 500 ? "warning" : "down";
}

// Falhas do nosso próprio validador/DNS não dizem nada sobre o site.
export function isInconclusiveError(message: string): boolean {
  return /validar o destino|Destino interno ou indispon/.test(message);
}

// Teste HTTP direto e resiliente: só retorna 'down' depois de dupla checagem com falha,
// repetindo enquanto couber no orçamento de tempo do lease.
export async function checkSite(
  url: string,
  probe: (url: string, timeoutMs: number) => Promise<number> = (u, t) => probePublicSite(u, resolvePublicAddresses, requestPublicSite, t),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now,
): Promise<{ status: SiteStatus; inconclusive: boolean }> {
  const started = now();
  let status: SiteStatus = "down";
  let inconclusive = false;
  let failures = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = now();
    const remaining = PROBE_BUDGET_MS - (t0 - started);
    if (attempt > 0 && remaining < 3000) break;
    inconclusive = false;
    try {
      const code = await probe(url, Math.min(TIMEOUT_MS, Math.max(remaining, 3000)));
      status = classifyStatusCode(code, now() - t0);
    } catch (e) {
      status = "down";
      const msg = e instanceof Error ? e.message : String(e);
      inconclusive = isInconclusiveError(msg);
      console.error("Uptime probe falhou:", msg);
    }
    if (status !== "down") break;
    failures++;
    if (inconclusive) break;
    // 'down' exige pelo menos duas falhas; a terceira só ocorre se ainda houver tempo.
    if (failures >= 2 && PROBE_BUDGET_MS - (now() - started) < TIMEOUT_MS + RETRY_DELAY_MS) break;
    await sleep(RETRY_DELAY_MS);
  }
  return { status, inconclusive };
}

export async function runUptimeCheck(projectIds?: string[]) {
  if (projectIds && projectIds.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("projects").select("id,url,name,uptime_status").eq("kind", "site").not("url", "is", null);
  if (projectIds) query = query.in("id", projectIds);
  const { data: projects, error } = await query;
  if (error) throw new Error("Não foi possível consultar o monitoramento.");
  const results: { id: string; status: SiteStatus }[] = [];
  // Sequential requests keep concurrency bounded; HEAD never downloads pages.
  for (const project of projects ?? []) {
    const token = crypto.randomUUID();
    const { data: acquired, error: leaseError } = await supabaseAdmin.rpc("acquire_uptime_probe", { _project: project.id, _token: token });
    if (leaseError) throw new Error("Não foi possível iniciar o monitoramento.");
    if (!acquired) continue;
    const started = Date.now();
    const { status, inconclusive } = await checkSite(project.url!);
    if (status === "down" && inconclusive) {
      // Checker-side failure: keep the previous status and send no alert.
      await supabaseAdmin.rpc("finish_uptime_probe", {
        _project: project.id, _token: token, _status: (project.uptime_status ?? "online") as "online" | "warning" | "down", _latency: Date.now() - started,
      });
      continue;
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