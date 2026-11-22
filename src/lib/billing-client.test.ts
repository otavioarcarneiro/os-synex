import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail, update, state } = vi.hoisted(() => ({ sendEmail: vi.fn(), update: vi.fn(), state: { profile: null as any, invoices: [] as any[], error: null as any, filters: [] as [string, unknown][] } }));

vi.mock("@/integrations/supabase/client.server", () => {
  const list: any = {
    select: () => list, order: () => list, limit: () => list,
    eq: (col: string, val: unknown) => { state.filters.push([col, val]); return list; },
    then: (res: (v: unknown) => unknown) => res({ data: state.invoices, error: state.error }),
  };
  return { supabaseAdmin: { from: (t: string) => (t === "profiles" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) } : { ...list, update }) } };
});
vi.mock("./email.server", async () => ({ ...(await vi.importActual<typeof import("./email.server")>("./email.server")), sendEmail }));

import { sendClientInvoicesManually } from "./billing.server";
import { FROM_FINANCEIRO, clientInvoicesHtml } from "./email.server";

const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined); update.mockReset(); state.filters = []; state.error = null;
  state.profile = { full_name: "Maria Souza", email: "maria@x.com" };
  state.invoices = [{ id: "i1", amount: 147, due_date: "2020-01-10", project: { name: "Site Maria" } }, { id: "i2", amount: 200, due_date: future, project: { name: "Instagram <Maria>" } }];
});

describe("cobrança manual por cliente", () => {
  it("envia UM e-mail consolidado de financeiro@ com todas as faturas, total e PIX", async () => {
    await expect(sendClientInvoicesManually("c1")).resolves.toEqual({ count: 2, total: 347 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [from, to, subject, html] = sendEmail.mock.calls[0]!;
    expect(from).toBe(FROM_FINANCEIRO);
    expect(to).toBe("maria@x.com");
    expect(subject).toContain("Faturas Synex em aberto");
    expect(html).toContain("Site Maria");
    expect(html).toContain("Instagram &lt;Maria&gt;");
    expect(html).toContain("synex.presence@gmail.com");
    expect(html).toContain("(vencida)");
  });
  it("filtra só faturas pendentes do cliente pedido", async () => {
    await sendClientInvoicesManually("c1");
    expect(state.filters).toEqual(expect.arrayContaining([["status", "pending"], ["project.client_id", "c1"]]));
  });
  it("uma única fatura usa assunto com o projeto", async () => {
    state.invoices = [state.invoices[0]];
    await sendClientInvoicesManually("c1");
    expect(sendEmail.mock.calls[0]![2]).toContain("Site Maria");
  });
  it("não altera agendamentos automáticos nem agradecimento (nenhum update)", async () => {
    await sendClientInvoicesManually("c1");
    expect(update).not.toHaveBeenCalled();
  });
  it("recusa cliente inexistente, sem e-mail ou sem faturas pendentes", async () => {
    state.profile = null;
    await expect(sendClientInvoicesManually("c1")).rejects.toThrow("não encontrado");
    state.profile = { full_name: "X", email: null };
    await expect(sendClientInvoicesManually("c1")).rejects.toThrow("e-mail");
    state.profile = { full_name: "X", email: "x@x.com" }; state.invoices = [];
    await expect(sendClientInvoicesManually("c1")).rejects.toThrow("pendentes");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("erro de banco e falha de envio chegam ao chamador", async () => {
    state.error = { message: "x" };
    await expect(sendClientInvoicesManually("c1")).rejects.toThrow("carregar");
    state.error = null; sendEmail.mockRejectedValue(new Error("Falha no envio de e-mail [500]"));
    await expect(sendClientInvoicesManually("c1")).rejects.toThrow("Falha no envio");
  });
});

describe("html consolidado", () => {
  it("fatura única fala no singular e sem 'vencida' quando em dia", () => {
    const html = clientInvoicesHtml("Ana", [{ project: "Site", due_date: "2026-12-05", amount: 147, overdue: false }]);
    expect(html).toContain("Segue a fatura em aberto");
    expect(html).not.toContain("(vencida)");
    expect(html).toContain("R$");
  });
});
