import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceClients } from "./finance-clients";
import { buildClientRows } from "@/lib/finance-clients";

const rows = buildClientRows(
  [{ id: "c1", full_name: "Maria Souza", email: "maria@x.com", phone: "11999990000" }, { id: "c2", full_name: "Álvaro Lima", email: null }],
  [
    { id: "p1", name: "Site Maria", kind: "site", client_id: "c1", billing_enabled: true, contract_start: "2026-08-10" },
    { id: "p2", name: "Instagram Maria", kind: "instagram", client_id: "c1", billing_enabled: true, contract_start: "2026-03-01" },
    { id: "p3", name: "Site Álvaro", kind: "site", client_id: "c2", billing_enabled: true, contract_start: "2026-01-01" },
  ],
  [
    { id: "i1", project_id: "p1", amount: 147, due_date: "2026-11-05", status: "pending", paid_at: null, sent_at: null },
    { id: "i2", project_id: "p2", amount: 200, due_date: "2026-12-05", status: "pending", paid_at: null, sent_at: null },
    { id: "i3", project_id: "p1", amount: 147, due_date: "2026-10-05", status: "paid", paid_at: "2026-10-04T10:00:00Z", sent_at: null },
  ],
  "2026-11-21", new Date("2026-11-21T12:00:00"),
);
const actions = (over = {}) => ({ isOwner: true, sendingClient: null, sendingReminder: null, onSendClient: vi.fn(), onSendReminder: vi.fn(), onMarkPaid: vi.fn(), ...over });

describe("lista de clientes do Financeiro", () => {
  it("mostra nome completo, projetos, recorrência, faturas em aberto e botão de enviar por cliente", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    expect(screen.getByText("Maria Souza")).toBeTruthy();
    expect(screen.getAllByText("Site Maria").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Instagram Maria").length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s*347,00\/mês/)).toBeTruthy();
    expect(screen.getByText(/R\$\s*347,00 em aberto/)).toBeTruthy();
    expect(screen.getByText("Faturas em aberto")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Enviar fatura/ })[0]).toBeTruthy();
    expect(screen.getByText("Álvaro Lima")).toBeTruthy();
  });
  it("cliente com vários projetos: o botão abre o seletor e envia só os projetos marcados", () => {
    const a = actions();
    render(<FinanceClients rows={rows} actions={a} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Enviar fatura/ })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Selecionar projetos para cobrança")).toBeTruthy();
    expect(within(dialog).getByText(/registrados como faturas em aberto/)).toBeTruthy();
    expect(screen.queryByText("Histórico de faturas")).toBeNull(); // não abriu o detalhe
    const boxes = within(dialog).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
    fireEvent.click(boxes[1]!); // desmarca o segundo projeto
    fireEvent.click(within(dialog).getByRole("button", { name: /Enviar cobrança/ }));
    expect(a.onSendClient).toHaveBeenCalledTimes(1);
    expect(a.onSendClient).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), ["p1"]);
  });
  it("cliente com um único projeto envia direto, sem seletor", () => {
    const one = buildClientRows(
      [{ id: "c9", full_name: "Joana Dias", email: "joana@x.com" }],
      [{ id: "p9", name: "Site Joana", kind: "site", client_id: "c9", billing_enabled: true, contract_start: "2026-08-10" }],
      [], "2026-11-21", new Date("2026-11-21T12:00:00"),
    );
    const a = actions();
    render(<FinanceClients rows={one} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar fatura/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(a.onSendClient).toHaveBeenCalledWith(expect.objectContaining({ id: "c9" }), ["p9"]);
  });
  it("o botão funciona mesmo sem nenhuma fatura registrada (depende só de e-mail e projeto)", () => {
    const none = buildClientRows(
      [{ id: "c9", full_name: "Joana Dias", email: "joana@x.com" }],
      [{ id: "p9", name: "Site Joana", kind: "site", client_id: "c9", billing_enabled: false, contract_start: "2026-08-10" }],
      [], "2026-11-21", new Date("2026-11-21T12:00:00"),
    );
    render(<FinanceClients rows={none} actions={actions()} />);
    expect((screen.getByRole("button", { name: /Enviar fatura/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("faturas em aberto aparecem no cartão e podem ser baixadas direto dali", () => {
    const a = actions();
    render(<FinanceClients rows={rows} actions={a} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Marcar pago/ })[0]!);
    expect(a.onMarkPaid).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("cliente sem e-mail tem o botão desabilitado", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    const buttons = screen.getAllByRole("button", { name: /Enviar fatura/ }) as HTMLButtonElement[];
    expect(buttons.some((b) => b.disabled)).toBe(true);
    expect(buttons.some((b) => !b.disabled)).toBe(true);
  });
  it("quem não é Proprietário não vê botões de envio", () => {
    render(<FinanceClients rows={rows} actions={actions({ isOwner: false })} />);
    expect(screen.queryByRole("button", { name: /Enviar fatura/ })).toBeNull();
  });
  it("clicar em qualquer parte do cartão também abre o detalhe", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    fireEvent.click(screen.getAllByText("Instagram Maria")[0]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("clicar no cliente abre o detalhe com projetos e histórico completo", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    fireEvent.click(screen.getByText("Maria Souza"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Histórico de faturas")).toBeTruthy();
    expect(within(dialog).getByText("maria@x.com")).toBeTruthy();
    expect(within(dialog).getAllByText(/Vencimento/).length).toBe(3); // 3 faturas no histórico (2 pendentes + 1 paga)
    expect(within(dialog).getByText(/pago em 04\/10\/2026/)).toBeTruthy();
    expect(within(dialog).getByText("Pago")).toBeTruthy();
    expect(within(dialog).getAllByText("Vencida").length).toBe(1); // selo do cliente
    expect(within(dialog).getAllByText("Cobrança ligada").length).toBe(2);
  });
  it("no detalhe, o cliente pode receber lembrete e cada fatura pendente pode ser baixada", () => {
    const a = actions();
    render(<FinanceClients rows={rows} actions={a} />);
    fireEvent.click(screen.getByText("Maria Souza"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Enviar lembrete/ }));
    expect(a.onSendReminder).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Marcar pago/ })[0]!);
    expect(a.onMarkPaid).toHaveBeenCalledTimes(1);
  });
  it("busca por cliente ou projeto filtra a lista", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar cliente ou projeto/), { target: { value: "alvaro" } });
    expect(screen.queryByText("Maria Souza")).toBeNull();
    expect(screen.getByText("Álvaro Lima")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar cliente ou projeto/), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum cliente encontrado.")).toBeTruthy();
  });
});
