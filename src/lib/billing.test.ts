import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail, update, state } = vi.hoisted(() => ({ sendEmail: vi.fn(), update: vi.fn(), state: { row: null as any } }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
      update,
    }),
  },
}));
vi.mock("./email.server", async () => {
  const actual = await vi.importActual<typeof import("./email.server")>("./email.server");
  return { ...actual, sendEmail };
});

import { sendInvoiceManually } from "./billing.server";
import { FROM_FINANCEIRO, PIX_KEY, invoiceHtml } from "./email.server";

const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const past = "2020-01-10";
const makeRow = (over: any = {}) => ({
  id: "i1", amount: 147, due_date: future, status: "pending",
  reminder_sent_at: null, due_notice_sent_at: null, thanks_sent_at: null,
  project: { name: "Site Teste", client: { email: "cliente@example.com", full_name: "Maria" } },
  ...over,
});

beforeEach(() => { sendEmail.mockReset().mockResolvedValue(undefined); update.mockReset(); state.row = makeRow(); });

describe("cobrança manual (Enviar fatura)", () => {
  it("envia de financeiro@ ao cliente com dados da fatura e chave PIX", async () => {
    await expect(sendInvoiceManually("i1")).resolves.toBe(true);
    const [from, to, subject, html] = sendEmail.mock.calls[0]!;
    expect(from).toBe(FROM_FINANCEIRO);
    expect(from).toContain("financeiro@synexdigital.com.br");
    expect(to).toBe("cliente@example.com");
    expect(subject).toContain("Fatura Synex");
    expect(html).toContain("Site Teste");
    expect(html).toContain("synex.presence@gmail.com");
  });
  it("não altera agendamentos automáticos nem o agradecimento (nenhum update)", async () => {
    await sendInvoiceManually("i1");
    expect(update).not.toHaveBeenCalled();
  });
  it("permite reenviar a mesma fatura mesmo com lembretes já enviados", async () => {
    state.row = makeRow({ reminder_sent_at: "2026-11-01T00:00:00Z", due_notice_sent_at: "2026-11-04T00:00:00Z" });
    await expect(sendInvoiceManually("i1")).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
  it("fatura vencida usa assunto de atraso", async () => {
    state.row = makeRow({ due_date: past });
    await sendInvoiceManually("i1");
    expect(sendEmail.mock.calls[0]![2]).toContain("em atraso");
  });
  it("recusa fatura já paga", async () => {
    state.row = makeRow({ status: "paid" });
    await expect(sendInvoiceManually("i1")).rejects.toThrow("pendentes");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("recusa quando o cliente não tem e-mail", async () => {
    state.row = makeRow({ project: { name: "X", client: { email: null, full_name: "Maria" } } });
    await expect(sendInvoiceManually("i1")).rejects.toThrow("e-mail");
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("recusa fatura inexistente", async () => {
    state.row = null;
    await expect(sendInvoiceManually("i1")).rejects.toThrow("não encontrada");
  });
  it("propaga falha de envio ao chamador", async () => {
    sendEmail.mockRejectedValue(new Error("Falha no envio de e-mail [500]"));
    await expect(sendInvoiceManually("i1")).rejects.toThrow("Falha no envio");
  });
});

describe("html da fatura", () => {
  const inv = { amount: 200, due_date: "2026-12-05", project: "Meu <Site>", name: "Ana" };
  it("traz valor, vencimento e PIX, escapando HTML", () => {
    const html = invoiceHtml(inv, false);
    expect(html).toContain(PIX_KEY);
    expect(html).toContain("05/12/2026");
    expect(html).toContain("Meu &lt;Site&gt;");
    expect(html).not.toContain("Meu <Site>");
  });
});
