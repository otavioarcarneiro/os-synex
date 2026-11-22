import { describe, expect, it } from "vitest";
import { buildClientRows, filterClients, type ClientProfile, type InvoiceRow, type ProjectRow } from "./finance-clients";

const REF = new Date("2026-11-21T12:00:00");
const TODAY = "2026-11-21";
const clients: ClientProfile[] = [
  { id: "c1", full_name: "Maria Souza", email: "maria@x.com", phone: "11999990000" },
  { id: "c2", full_name: "Álvaro Lima", email: "alvaro@x.com" },
  { id: "c3", full_name: null, email: "semnome@x.com" },
  { id: "c4", full_name: "Zélia Prado", email: null },
];
const projects: ProjectRow[] = [
  { id: "p1", name: "Site Maria", kind: "site", client_id: "c1", billing_enabled: true, contract_start: "2026-08-10" },   // R$ 147
  { id: "p2", name: "Instagram Maria", kind: "instagram", client_id: "c1", billing_enabled: true, contract_start: "2026-03-01" }, // R$ 200
  { id: "p3", name: "Site Álvaro", kind: "site", client_id: "c2", billing_enabled: false, contract_start: "2026-09-01" },
  { id: "p4", name: "Site Zélia", kind: "site", client_id: "c4", billing_enabled: true, contract_start: "2026-01-05" },
];
const inv = (id: string, project_id: string, due_date: string, status: string, amount = 147, paid_at: string | null = null): InvoiceRow => ({ id, project_id, amount, due_date, status, paid_at, sent_at: null });
const invoices: InvoiceRow[] = [
  inv("i1", "p1", "2026-11-05", "pending"),                    // vencida
  inv("i2", "p2", "2026-12-05", "pending", 200),               // a vencer
  inv("i3", "p1", "2026-10-05", "paid", 147, "2026-10-04T10:00:00Z"),
  inv("i4", "p3", "2026-10-10", "paid", 147, "2026-10-09T10:00:00Z"),
  inv("i5", "p4", "2026-12-01", "pending", "200" as unknown as number),
];
const rows = buildClientRows(clients, projects, invoices, TODAY, REF);
const byId = (id: string) => rows.find((r) => r.id === id)!;

describe("clientes do financeiro", () => {
  it("lista todos os clientes, inclusive sem projetos e sem nome", () => {
    expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c2", "c3", "c4"]);
    expect(byId("c3").name).toBe("semnome@x.com");
    expect(byId("c3").projects).toEqual([]);
    expect(byId("c3").status).toBe("none");
  });
  it("mostra os projetos do cliente e a recorrência mensal (só cobrança ligada)", () => {
    const m = byId("c1");
    expect(m.projects.map((p) => p.name)).toEqual(["Site Maria", "Instagram Maria"]);
    expect(m.projects.map((p) => p.fee)).toEqual([147, 200]);
    expect(m.monthly).toBe(347);
    expect(byId("c2").monthly).toBe(0); // cobrança desligada
    expect(byId("c2").projects[0]!.billing).toBe(false);
  });
  it("soma em aberto, vencidas e total pago", () => {
    const m = byId("c1");
    expect([m.openCount, m.openAmount, m.overdueCount, m.paidTotal]).toEqual([2, 347, 1, 147]);
    expect(m.nextDue).toBe("2026-11-05");
    expect(byId("c4").openAmount).toBe(200); // valor como texto vindo do banco
  });
  it("histórico completo, mais recente primeiro, com projeto e marca de vencida", () => {
    const h = byId("c1").invoices;
    expect(h.map((i) => i.id)).toEqual(["i2", "i1", "i3"]);
    expect(h.map((i) => i.overdue)).toEqual([false, true, false]);
    expect(h[2]!.projectName).toBe("Site Maria");
    expect(h[2]!.paidAt).toBe("2026-10-04T10:00:00Z");
  });
  it("status e ordem: vencida, a vencer, em dia, sem faturas", () => {
    expect(rows.map((r) => [r.id, r.status])).toEqual([["c1", "overdue"], ["c4", "pending"], ["c2", "ok"], ["c3", "none"]]);
  });
  it("não mistura faturas de outro cliente", () => {
    expect(byId("c2").invoices.map((i) => i.id)).toEqual(["i4"]);
  });
});

describe("busca", () => {
  it("ignora acentos e maiúsculas; busca nome, e-mail e projeto", () => {
    expect(filterClients(rows, "alvaro").map((r) => r.id)).toEqual(["c2"]);
    expect(filterClients(rows, "ZELIA").map((r) => r.id)).toEqual(["c4"]);
    expect(filterClients(rows, "instagram").map((r) => r.id)).toEqual(["c1"]);
    expect(filterClients(rows, "semnome@").map((r) => r.id)).toEqual(["c3"]);
  });
  it("vazio devolve todos; sem resultado devolve nenhum", () => {
    expect(filterClients(rows, "  ")).toHaveLength(4);
    expect(filterClients(rows, "inexistente")).toHaveLength(0);
  });
});
