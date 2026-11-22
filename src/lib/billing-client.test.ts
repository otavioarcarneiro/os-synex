import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail, update, db } = vi.hoisted(() => ({
  sendEmail: vi.fn(), update: vi.fn(),
  db: { profile: null as any, projects: [] as any[], invoices: [] as any[], insertError: null as any, inserted: [] as any[], loadError: null as any },
}));

// Banco em memória mínimo: lê projects/invoices e grava invoices (insert); qualquer update é registrado.
vi.mock("@/integrations/supabase/client.server", () => {
  const builder = (table: string) => {
    const f: { eq: [string, unknown][]; inn: [string, unknown[]][] } = { eq: [], inn: [] };
    const b: any = {
      select: () => b, order: () => b,
      eq: (c: string, v: unknown) => { f.eq.push([c, v]); return b; },
      in: (c: string, v: unknown[]) => { f.inn.push([c, v]); return b; },
      maybeSingle: async () => ({ data: db.profile, error: null }),
      insert: async (rows: any[]) => { if (db.insertError) return { error: db.insertError }; db.invoices.push(...rows.map((r) => ({ status: "pending", ...r }))); db.inserted.push(...rows); return { error: null }; },
      update,
      then: (res: (v: unknown) => unknown) => {
        if (db.loadError) return res({ data: null, error: db.loadError });
        const src = table === "projects" ? db.projects : db.invoices;
        const data = src.filter((r) => f.eq.every(([c, v]) => r[c] === v) && f.inn.every(([c, v]) => v.includes(r[c])));
        return res({ data, error: null });
      },
    };
    return b;
  };
  return { supabaseAdmin: { from: (t: string) => (t === "profiles" ? builder("profiles") : builder(t)) } };
});
vi.mock("./email.server", async () => ({ ...(await vi.importActual<typeof import("./email.server")>("./email.server")), sendEmail }));

import { sendSelectedClientInvoicesManually } from "./billing.server";
import { FROM_FINANCEIRO } from "./email.server";

const THIS_MONTH = new Date();
const month = `${THIS_MONTH.getFullYear()}-${String(THIS_MONTH.getMonth() + 1).padStart(2, "0")}`;

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined); update.mockReset();
  db.insertError = null; db.loadError = null; db.inserted = []; db.invoices = [];
  db.profile = { full_name: "Maria Souza", email: "maria@x.com" };
  db.projects = [
    { id: "p1", client_id: "c1", name: "Site Maria", contract_start: "2026-08-10", billing_enabled: true },
    { id: "p2", client_id: "c1", name: "Instagram <Maria>", contract_start: "2026-03-01", billing_enabled: false },
    { id: "p9", client_id: "outro", name: "Site de outro cliente", contract_start: "2026-01-01", billing_enabled: true },
  ];
});

describe("Enviar fatura: registra em aberto e envia o e-mail", () => {
  it("cria uma fatura pendente por projeto escolhido e envia UM e-mail de financeiro@", async () => {
    const r = await sendSelectedClientInvoicesManually("c1", ["p1", "p2"]);
    expect(r).toMatchObject({ count: 2, total: 347, created: 2, skipped: [] });
    expect(db.inserted).toEqual([
      { project_id: "p1", amount: 147, due_date: `${month}-10` },
      { project_id: "p2", amount: 200, due_date: `${month}-01` },
    ]);
    expect(db.invoices.every((i) => i.status === "pending")).toBe(true); // entram em aberto (somam no Financeiro e no Dashboard)
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [from, to, subject, html] = sendEmail.mock.calls[0]!;
    expect(from).toBe(FROM_FINANCEIRO);
    expect(to).toBe("maria@x.com");
    expect(subject).toContain("2 projetos");
    expect(html).toContain("Site Maria");
    expect(html).toContain("Instagram &lt;Maria&gt;");
    expect(html).toContain("synex.presence@gmail.com");
  });
  it("clicar de novo não duplica: reenvia a mesma fatura em aberto", async () => {
    await sendSelectedClientInvoicesManually("c1", ["p1"]);
    db.inserted = [];
    const again = await sendSelectedClientInvoicesManually("c1", ["p1"]);
    expect(again).toMatchObject({ count: 1, created: 0 });
    expect(db.inserted).toEqual([]);
    expect(db.invoices).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it("projeto já pago neste mês não é cobrado de novo", async () => {
    db.invoices = [{ project_id: "p1", status: "paid", due_date: `${month}-10`, amount: 147 }];
    const r = await sendSelectedClientInvoicesManually("c1", ["p1", "p2"]);
    expect(r).toMatchObject({ count: 1, created: 1, skipped: ["Site Maria"] });
    expect(sendEmail.mock.calls[0]![3]).not.toContain("Site Maria");
  });
  it("tudo pago: recusa sem enviar", async () => {
    db.invoices = [{ project_id: "p1", status: "paid", due_date: `${month}-10`, amount: 147 }];
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("já está paga");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("não mexe nos lembretes automáticos nem no agradecimento (nenhum update)", async () => {
    await sendSelectedClientInvoicesManually("c1", ["p1", "p2"]);
    expect(update).not.toHaveBeenCalled();
  });
  it("não deixa cobrar projeto de outro cliente", async () => {
    await expect(sendSelectedClientInvoicesManually("c1", ["p1", "p9"])).rejects.toThrow("não pertencem");
    expect(db.inserted).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("recusa cliente inexistente, sem e-mail ou sem projetos selecionados", async () => {
    db.profile = null;
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("não encontrado");
    db.profile = { full_name: "X", email: null };
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("e-mail");
    db.profile = { full_name: "X", email: "x@x.com" };
    await expect(sendSelectedClientInvoicesManually("c1", [])).rejects.toThrow("Selecione");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("falha ao registrar a fatura: não envia e-mail", async () => {
    db.insertError = { message: "x" };
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("registrar");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("falha no e-mail depois de registrar: avisa que ficou em aberto e o reenvio não duplica", async () => {
    sendEmail.mockRejectedValueOnce(new Error("Falha no envio de e-mail [500]"));
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("registrada em aberto");
    expect(db.invoices).toHaveLength(1);
    await sendSelectedClientInvoicesManually("c1", ["p1"]);
    expect(db.invoices).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it("erro ao verificar faturas existentes: não registra nada", async () => {
    db.loadError = { message: "db" };
    await expect(sendSelectedClientInvoicesManually("c1", ["p1"])).rejects.toThrow("carregar");
    expect(db.inserted).toEqual([]);
  });
});
