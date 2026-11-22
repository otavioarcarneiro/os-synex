import { monthlyFee } from "./pricing";

// Planejamento do "Enviar fatura": registra a fatura do mês (em aberto) sem duplicar e define o que vai no e-mail.
// Mesmo critério de "Gerar faturas do mês": vencimento = dia do contrato (máx. 28) no mês corrente; 1 fatura por projeto/mês.
export type PlanProject = { id: string; name: string; contract_start: string };
export type PlanInvoice = { project_id: string; status: string; due_date: string; amount: number | string };
export type PlanItem = { project: string; due_date: string; amount: number; overdue: boolean };
export type NewInvoice = { project_id: string; amount: number; due_date: string };

const pad = (n: number) => String(n).padStart(2, "0");
export function monthWindow(now: Date) {
  const y = now.getFullYear(), m = now.getMonth();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` };
}
export function dueDateFor(contractStart: string, now: Date) {
  const day = Math.min(28, new Date(contractStart + "T12:00:00").getDate());
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`;
}

export function planManualInvoices(projects: PlanProject[], existing: PlanInvoice[], now: Date, today: string) {
  const { start, end } = monthWindow(now);
  const toCreate: NewInvoice[] = [];
  const items: PlanItem[] = [];
  const skipped: string[] = []; // projetos cuja fatura do mês já foi paga (ou encerrada): não cobra de novo
  for (const p of projects) {
    const mine = existing.filter((i) => i.project_id === p.id && i.due_date >= start && i.due_date <= end);
    const pending = mine.filter((i) => i.status === "pending");
    if (pending.length) { // já registrada em aberto: reaproveita, nunca duplica
      for (const i of pending) items.push({ project: p.name, due_date: i.due_date, amount: Number(i.amount), overdue: i.due_date < today });
      continue;
    }
    if (mine.length) { skipped.push(p.name); continue; }
    const due_date = dueDateFor(p.contract_start, now), amount = monthlyFee(p.contract_start, now);
    toCreate.push({ project_id: p.id, amount, due_date });
    items.push({ project: p.name, due_date, amount, overdue: due_date < today });
  }
  return { toCreate, items, skipped, total: items.reduce((s, i) => s + i.amount, 0) };
}
