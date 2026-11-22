// Cliente server-only da API v3 do UptimeRobot (somente leitura nesta etapa).
// A chave é lida de process.env dentro de cada chamada e nunca é incluída em erros ou logs.

export const UPTIMEROBOT_BASE_URL = "https://api.uptimerobot.com/v3";
const REQUEST_TIMEOUT_MS = 15_000;
const WINDOW_MS = 60_000;
export const MAX_CALLS_PER_WINDOW = 8;

export type UptimeRobotErrorCode =
  | "missing_key"
  | "timeout"
  | "network"
  | "unauthorized"
  | "rate_limited"
  | "http_error"
  | "invalid_response";

export class UptimeRobotError extends Error {
  constructor(
    public readonly code: UptimeRobotErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "UptimeRobotError";
  }
}

export interface UptimeRobotMonitor {
  id: number;
  friendlyName?: string;
  url?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

export interface MonitorsPage {
  data: UptimeRobotMonitor[];
  nextLink: string | null;
}

// Limitador de janela deslizante (por instância do Worker) + bloqueio vindo dos headers/429.
const callTimestamps: number[] = [];
let blockedUntil = 0;

function reserveSlot(now = Date.now()): void {
  if (now < blockedUntil) {
    throw new UptimeRobotError(
      "rate_limited",
      "Limite de requisições do UptimeRobot atingido. Aguarde antes de tentar novamente.",
      null,
      Math.ceil((blockedUntil - now) / 1000),
    );
  }
  while (callTimestamps.length && now - callTimestamps[0]! >= WINDOW_MS) callTimestamps.shift();
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const wait = WINDOW_MS - (now - callTimestamps[0]!);
    throw new UptimeRobotError(
      "rate_limited",
      "Limite interno de requisições atingido. Aguarde antes de tentar novamente.",
      null,
      Math.ceil(wait / 1000),
    );
  }
  callTimestamps.push(now);
}

function parseSeconds(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return null;
}

function applyRateLimitHeaders(headers: Headers): void {
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const reset = parseSeconds(headers.get("x-ratelimit-reset"));
  // Mantém margem de 2 chamadas sobre o teto da conta.
  if (Number.isFinite(remaining) && remaining <= 2 && reset !== null) {
    blockedUntil = Math.max(blockedUntil, Date.now() + reset * 1000);
  }
}

async function request<T>(path: string): Promise<T> {
  const key = process.env["UPTIMEROBOT_API_KEY"];
  if (!key) throw new UptimeRobotError("missing_key", "Chave do UptimeRobot não configurada.");

  reserveSlot();

  const controller = new AbortController();
  // O timer cobre toda a operação HTTP: cabeçalhos + leitura do corpo.
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${UPTIMEROBOT_BASE_URL}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new UptimeRobotError("timeout", "O UptimeRobot não respondeu a tempo.");
      }
      throw new UptimeRobotError("network", "Falha de rede ao contatar o UptimeRobot.");
    }

    applyRateLimitHeaders(res.headers);

    if (res.status === 429) {
      const retry =
        parseSeconds(res.headers.get("retry-after")) ??
        parseSeconds(res.headers.get("x-ratelimit-reset")) ??
        60;
      blockedUntil = Math.max(blockedUntil, Date.now() + retry * 1000);
      throw new UptimeRobotError("rate_limited", "UptimeRobot recusou por excesso de requisições.", 429, retry);
    }
    if (res.status === 401 || res.status === 403) {
      throw new UptimeRobotError("unauthorized", "Chave do UptimeRobot inválida ou sem permissão.", res.status);
    }
    if (!res.ok) {
      // Corpo da resposta não é repassado para evitar vazar dados sensíveis.
      throw new UptimeRobotError("http_error", `UptimeRobot respondeu com erro HTTP ${res.status}.`, res.status);
    }

    try {
      return (await res.json()) as T;
    } catch {
      if (controller.signal.aborted) {
        throw new UptimeRobotError("timeout", "O UptimeRobot não respondeu a tempo.");
      }
      throw new UptimeRobotError("invalid_response", "Resposta inválida do UptimeRobot.", res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta GET /monitors?limit=50 (primeira página). Somente leitura. */
export async function listMonitors(): Promise<MonitorsPage> {
  const body = await request<{ data?: unknown; nextLink?: unknown }>("/monitors?limit=50");
  if (!body || !Array.isArray(body.data)) {
    throw new UptimeRobotError("invalid_response", "Resposta inválida do UptimeRobot.");
  }
  return {
    data: body.data as UptimeRobotMonitor[],
    nextLink: typeof body.nextLink === "string" ? body.nextLink : null,
  };
}

/** Apenas para testes: zera o estado do limitador. */
export function __resetRateLimiterForTests(): void {
  callTimestamps.length = 0;
  blockedUntil = 0;
}
