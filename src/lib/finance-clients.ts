import { monthlyFee } from "./pricing";

export type ClientProfile = { id: string; full_name: string | null; email: string | null; phone?: string | null };
export type ProjectRow = { id: string; name: string; kind: string; client_id: string; billing_enabled: boolean; contract_start: string };
export type InvoiceRow = { id: string; project_id: string; amount: number | string; due_date: string; status: string; paid_at: string | null };

export type ClientInvoice = { id: string; projectId: string; projectName: string; amount: number; dueDate: string; status: string; paidAt: string | null; overdue: boolean };
export type ClientProject = { id: string; name: string; kind: string; billing: boolean; fee: number; contractStart: string };
export type ClientStatus = "overdue" | "pending" | "ok" | "none";
export type ClientRow = {
  id: string; name: string; email: string | null; phone: string | null;
  projects: ClientProject[]; monthly: number;
  openCount: number; openAmount: number; overdueCount: number; paidTotal: number; nextDue: string | null;
  status: ClientStatus; invoices: ClientInvoice[]; // histórico completo, mais recente primeiro
};

const ORDER: Record<ClientStatus, number> = { overdue: 0, pending: 1, ok: 2, none: 3 };

// Agrupa clientes, projetos e faturas. today = AAAA-MM-DD (fuso de São Paulo); ref define a regra de mensalidade.
export function buildClientRows(clients: ClientProfile[], projects: ProjectRow[], invoices: InvoiceRow[], today: string, ref: Date = new Date()): ClientRow[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows = clients.map((c): ClientRow => {
    const mine = projects.filter((p) => p.client_id === c.id);
    const cp: ClientProject[] = mine.map((p) => ({ id: p.id, name: p.name, kind: p.kind, billing: p.billing_enabled, fee: monthlyFee(p.contract_start, ref), contractStart: p.contract_start }));
    const ids = new Set(mine.map((p) => p.id));
    const inv: ClientInvoice[] = invoices.filter((i) => ids.has(i.project_id)).map((i) => ({
      id: i.id, projectId: i.project_id, projectName: projectById.get(i.project_id)?.name ?? "Projeto", amount: Number(i.amount),
      dueDate: i.due_date, status: i.status, paidAt: i.paid_at, overdue: i.status === "pending" && i.due_date < today,
    })).sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.projectName.localeCompare(b.projectName, "pt-BR"));
    const open = inv.filter((i) => i.status === "pending");
    const overdueCount = open.filter((i) => i.overdue).length;
    const status: ClientStatus = overdueCount ? "overdue" : open.length ? "pending" : inv.length ? "ok" : "none";
    return {
      id: c.id, name: c.full_name?.trim() || c.email || "Sem nome", email: c.email, phone: c.phone ?? null,
      projects: cp, monthly: cp.filter((p) => p.billing).reduce((s, p) => s + p.fee, 0),
      openCount: open.length, openAmount: open.reduce((s, i) => s + i.amount, 0), overdueCount,
      paidTotal: inv.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0),
      nextDue: open.length ? open.map((i) => i.dueDate).sort()[0]! : null, status, invoices: inv,
    };
  });
  return rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "pt-BR"));
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function filterClients(rows: ClientRow[], query: string): ClientRow[] {
  const q = norm(query.trim());
  if (!q) return rows;
  return rows.filter((r) => norm([r.name, r.email ?? "", ...r.projects.map((p) => p.name)].join(" ")).includes(q));
}
