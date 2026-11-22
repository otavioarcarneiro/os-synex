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
    { id: "i1", project_id: "p1", amount: 147, due_date: "2026-11-05", status: "pending", paid_at: null },
    { id: "i2", project_id: "p2", amount: 200, due_date: "2026-12-05", status: "pending", paid_at: null },
    { id: "i3", project_id: "p1", amount: 147, due_date: "2026-10-05", status: "paid", paid_at: "2026-10-04T10:00:00Z" },
  ],
  "2026-11-21", new Date("2026-11-21T12:00:00"),
);
const actions = (over = {}) => ({ isOwner: true, sendingClient: null, sendingInvoice: null, onSendClient: vi.fn(), onSendInvoice: vi.fn(), onMarkPaid: vi.fn(), ...over });

describe("lista de clientes do Financeiro", () => {
  it("mostra nome completo, projetos, recorrência e botão de enviar por cliente", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    expect(screen.getByRole("button", { name: "Abrir Maria Souza" }).textContent).toBe("Maria Souza");
    expect(screen.getByText("Site Maria")).toBeTruthy();
    expect(screen.getByText("Instagram Maria")).toBeTruthy();
    expect(screen.getByText(/R\$\s*347,00\/mês/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar faturas \(2\)/ })).toBeTruthy();
    expect(screen.getByText("Álvaro Lima")).toBeTruthy();
  });
  it("botão de enviar chama o envio do cliente sem abrir o detalhe", () => {
    const a = actions();
    render(<FinanceClients rows={rows} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar faturas \(2\)/ }));
    expect(a.onSendClient).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(screen.queryByText("Histórico de faturas")).toBeNull();
  });
  it("cliente sem e-mail ou sem pendências tem o botão desabilitado", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    const buttons = screen.getAllByRole("button", { name: /Enviar fatura/ });
    expect(buttons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
  it("quem não é Proprietário não vê botões de envio", () => {
    render(<FinanceClients rows={rows} actions={actions({ isOwner: false })} />);
    expect(screen.queryByRole("button", { name: /Enviar fatura/ })).toBeNull();
  });
  it("clicar em qualquer parte do cartão também abre o detalhe", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    fireEvent.click(screen.getByText("Instagram Maria"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("clicar no cliente abre o detalhe com projetos e histórico completo", () => {
    render(<FinanceClients rows={rows} actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Maria Souza" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Histórico de faturas")).toBeTruthy();
    expect(within(dialog).getByText("maria@x.com")).toBeTruthy();
    expect(within(dialog).getAllByText(/Vencimento/).length).toBe(3); // 3 faturas no histórico (2 pendentes + 1 paga)
    expect(within(dialog).getByText(/pago em 04\/10\/2026/)).toBeTruthy();
    expect(within(dialog).getByText("Pago")).toBeTruthy();
    expect(within(dialog).getAllByText("Vencida").length).toBe(2); // selo do cliente + fatura vencida do histórico
    expect(within(dialog).getAllByText("Cobrança ligada").length).toBe(2);
  });
  it("no detalhe, cada fatura pendente pode ser enviada ou baixada", () => {
    const a = actions();
    render(<FinanceClients rows={rows} actions={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Maria Souza" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button", { name: /^Enviar$/ })[0]!);
    expect(a.onSendInvoice).toHaveBeenCalledTimes(1);
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
