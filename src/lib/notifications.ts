import { brl } from "./pricing";

export type NotificationKind = "uptime" | "login" | "invoice" | "sac";
export type Severity = "danger" | "warning" | "info" | "success";
export type NotificationHref = "/app/projetos" | "/app/restrita" | "/app/financeiro" | "/app/suporte";
export type NotificationItem = {
  id: string; kind: NotificationKind; severity: Severity; title: string; detail: string; at: string; href: NotificationHref;
  twoFactorUserId?: string; // pedido de liberação do 2FA: habilita o botão "Liberar acesso"
};

export const KIND_LABEL: Record<NotificationKind, string> = { uptime: "Uptime", login: "Login", invoice: "Faturas", sac: "SAC" };

type SiteRow = { id: string; name: string; url: string | null; uptime_status: string; uptime_checked_at: string | null };
type AlertRow = { id: string; email: string; full_name: string | null; attempts: number; created_at: string; lock_scope: string; resolved: boolean };
type InvoiceRow = {
  id: string; amount: number | string; due_date: string;
  reminder_sent_at: string | null; due_notice_sent_at: string | null; thanks_sent_at: string | null;
  project?: { name?: string | null; client?: { full_name?: string | null; email?: string | null } | null } | null;
};
type TicketRow = { id: string; status: string; created_at: string; client?: { full_name?: string | null; email?: string | null } | null };

const dateBR = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR");

// Incidentes de uptime: estado atual dos sites (sem histórico) em queda ou com instabilidade.
export function uptimeNotifications(sites: SiteRow[]): NotificationItem[] {
  return sites.filter((s) => s.uptime_status === "down" || s.uptime_status === "warning").map((s) => ({
    id: `uptime:${s.id}`, kind: "uptime", href: "/app/projetos",
    severity: s.uptime_status === "down" ? "danger" : "warning",
    title: s.uptime_status === "down" ? "Site fora do ar" : "Site com instabilidade",
    detail: `${s.name}${s.url ? ` · ${s.url}` : ""}`,
    at: s.uptime_checked_at ?? "",
  }));
}

export function loginNotifications(alerts: AlertRow[]): NotificationItem[] {
  return alerts.map((a) => ({
    id: `login:${a.id}`, kind: "login", href: "/app/restrita",
    severity: a.resolved ? "info" : "danger",
    title: a.resolved ? "Bloqueio de login resolvido" : "Bloqueio de login",
    detail: `${a.full_name || a.email} · ${a.attempts} tentativa(s) · ${a.lock_scope === "origin" ? "origem bloqueada, conta preservada" : "conta bloqueada"}`,
    at: a.created_at,
  }));
}

// Faturas enviadas: lembretes, avisos de vencimento e agradecimentos já disparados (colunas *_sent_at).
// Envios manuais ("Enviar fatura") não gravam data no banco e, por isso, não aparecem aqui.
export function invoiceNotifications(rows: InvoiceRow[]): NotificationItem[] {
  const out: NotificationItem[] = [];
  for (const r of rows) {
    const who = r.project?.client?.full_name || r.project?.client?.email || "cliente";
    const detail = `${r.project?.name ?? "Projeto"} · ${who} · ${brl(Number(r.amount))} · vence ${dateBR(r.due_date)}`;
    const events: [string | null, string, Severity, string][] = [
      [r.reminder_sent_at, "reminder", "info", "Lembrete de fatura enviado (3 dias antes)"],
      [r.due_notice_sent_at, "due", "warning", "Aviso de vencimento enviado"],
      [r.thanks_sent_at, "thanks", "success", "Agradecimento de pagamento enviado"],
    ];
    for (const [at, key, severity, title] of events) {
      if (at) out.push({ id: `invoice:${r.id}:${key}`, kind: "invoice", href: "/app/financeiro", severity, title, detail, at });
    }
  }
  return out;
}

export type TwoFactorRequest = { userId: string; ticketId: string | null };
export function sacNotifications(tickets: TicketRow[], requests: TwoFactorRequest[] = []): NotificationItem[] {
  return tickets.map((t) => {
    const who = t.client?.full_name || t.client?.email || "Cliente";
    const req = requests.find((r) => r.ticketId === t.id);
    if (req && t.status === "human") return { id: `sac:${t.id}`, kind: "sac", href: "/app/suporte", severity: "danger", title: "Colaborador sem acesso ao e-mail (2FA)", detail: `${who} pediu liberação do acesso`, at: t.created_at, twoFactorUserId: req.userId } as NotificationItem;
    if (t.status === "human") return { id: `sac:${t.id}`, kind: "sac", href: "/app/suporte", severity: "danger", title: "Pedido do SAC aguardando você", detail: who, at: t.created_at } as NotificationItem;
    if (t.status === "ai") return { id: `sac:${t.id}`, kind: "sac", href: "/app/suporte", severity: "info", title: "Atendimento em andamento com a IA", detail: who, at: t.created_at } as NotificationItem;
    return { id: `sac:${t.id}`, kind: "sac", href: "/app/suporte", severity: "success", title: "Atendimento encerrado", detail: who, at: t.created_at } as NotificationItem;
  });
}

const time = (iso: string) => (iso ? new Date(iso).getTime() : 0);
export function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return items.slice().sort((a, b) => time(b.at) - time(a.at));
}
