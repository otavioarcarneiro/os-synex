import { describe, expect, it } from "vitest";
import { dueDateFor, monthWindow, planManualInvoices, type PlanInvoice, type PlanProject } from "./manual-invoice";

const NOW = new Date(2026, 10, 21, 12); // 21/11/2026
const TODAY = "2026-11-21";
const P1: PlanProject = { id: "p1", name: "Site Maria", contract_start: "2026-08-10" };      // R$ 147, dia 10
const P2: PlanProject = { id: "p2", name: "Instagram Maria", contract_start: "2026-03-31" };  // R$ 200, dia 31 -> 28
const inv = (project_id: string, status: string, due_date: string, amount = 147): PlanInvoice => ({ project_id, status, due_date, amount });

describe("datas do mês", () => {
  it("janela do mês e vencimento (dia do contrato, máx. 28)", () => {
    expect(monthWindow(NOW)).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(dueDateFor("2026-08-10", NOW)).toBe("2026-11-10");
    expect(dueDateFor("2026-03-31", NOW)).toBe("2026-11-28");
    expect(monthWindow(new Date(2028, 1, 10)).end).toBe("2028-02-29");
  });
});

describe("registro da fatura manual", () => {
  it("sem faturas no mês: cria uma em aberto por projeto, com valor e vencimento da recorrência", () => {
    const r = planManualInvoices([P1, P2], [], NOW, TODAY);
    expect(r.toCreate).toEqual([{ project_id: "p1", amount: 147, due_date: "2026-11-10" }, { project_id: "p2", amount: 200, due_date: "2026-11-28" }]);
    expect(r.total).toBe(347);
    expect(r.items.map((i) => [i.project, i.overdue])).toEqual([["Site Maria", true], ["Instagram Maria", false]]);
    expect(r.skipped).toEqual([]);
  });
  it("não duplica: fatura pendente do mês é reaproveitada no e-mail", () => {
    const r = planManualInvoices([P1, P2], [inv("p1", "pending", "2026-11-10")], NOW, TODAY);
    expect(r.toCreate.map((i) => i.project_id)).toEqual(["p2"]);
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(347);
  });
  it("tudo já registrado: nada a criar (reenviar é seguro)", () => {
    const r = planManualInvoices([P1], [inv("p1", "pending", "2026-11-10")], NOW, TODAY);
    expect(r.toCreate).toEqual([]);
    expect(r.items).toHaveLength(1);
  });
  it("projeto já pago neste mês é pulado e não entra no e-mail", () => {
    const r = planManualInvoices([P1, P2], [inv("p1", "paid", "2026-11-10")], NOW, TODAY);
    expect(r.skipped).toEqual(["Site Maria"]);
    expect(r.toCreate.map((i) => i.project_id)).toEqual(["p2"]);
    expect(r.items.map((i) => i.project)).toEqual(["Instagram Maria"]);
    expect(r.total).toBe(200);
  });
  it("faturas de outros meses não bloqueiam a do mês atual", () => {
    const r = planManualInvoices([P1], [inv("p1", "paid", "2026-10-10"), inv("p1", "pending", "2026-12-10")], NOW, TODAY);
    expect(r.toCreate).toHaveLength(1);
  });
  it("tudo pago: nada a enviar", () => {
    const r = planManualInvoices([P1], [inv("p1", "paid", "2026-11-10")], NOW, TODAY);
    expect(r.items).toEqual([]);
    expect(r.toCreate).toEqual([]);
  });
});
