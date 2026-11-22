
import { useMemo, useState } from "react";
import { CheckCircle2, Mail, Phone, Repeat, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/pricing";
import { filterClients, type ClientInvoice, type ClientRow, type ClientStatus } from "@/lib/finance-clients";

const STATUS: Record<ClientStatus, { label: string; cls: string }> = {
  overdue: { label: "Vencida", cls: "border-danger text-danger" },
  pending: { label: "A vencer", cls: "border-warning text-warning" },
  ok: { label: "Em dia", cls: "border-success text-success" },
  none: { label: "Sem faturas", cls: "border-border text-muted-foreground" },
};
const date = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const KIND: Record<string, string> = { site: "Site", instagram: "Instagram" };

type Actions = {
  isOwner: boolean;
  sendingClient: string | null; sendingInvoice: string | null;
  onSendClient: (c: ClientRow, projectIds: string[]) => void;
  onSendInvoice: (i: ClientInvoice, c: ClientRow) => void;
  onMarkPaid: (i: ClientInvoice) => void;
};

function SendClientButton({ c, a, size = "sm", onChoose }: { c: ClientRow; a: Actions; size?: "sm" | "default"; onChoose: (c: ClientRow) => void }) {
  if (!a.isOwner) return null;
  const disabled = a.sendingClient === c.id || !c.email || c.projects.length === 0;
  return (
    <Button size={size} variant="outline" disabled={disabled} onClick={(e) => { e.stopPropagation(); onChoose(c); }}
      title={!c.email ? "Cliente sem e-mail cadastrado" : c.projects.length === 0 ? "Cliente sem projetos cadastrados" : undefined}>
      <Send className="h-4 w-4" /> {a.sendingClient === c.id ? "Enviando…" : "Enviar fatura"}
    </Button>
  );
}

export function FinanceClients({ rows, actions }: { rows: ClientRow[]; actions: Actions }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionClient, setSelectionClient] = useState<ClientRow | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const shown = useMemo(() => filterClients(rows, query), [rows, query]);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function chooseClient(c: ClientRow) {
    const only = c.projects[0];
    if (c.projects.length === 1 && only) {
      actions.onSendClient(c, [only.id]);
      return;
    }
    setSelectionClient(c);
    setSelectedProjectIds(c.projects.map((p) => p.id));
  }

  function toggleProject(id: string, checked: boolean) {
    setSelectedProjectIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  }

  function sendSelected() {
    if (!selectionClient || selectedProjectIds.length === 0) return;
    const client = selectionClient;
    const ids = [...selectedProjectIds];
    setSelectionClient(null);
    actions.onSendClient(client, ids);
  }

  const allSelected = !!selectionClient && selectionClient.projects.length > 0 && selectedProjectIds.length === selectionClient.projects.length;

  return (
    <>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente ou projeto…" className="bg-field pl-9" />
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{rows.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}</p> : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.id}>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#222733]">
                <div onClick={() => setSelectedId(c.id)}
                  className="flex cursor-pointer flex-wrap items-center gap-3 p-4 transition-colors hover:bg-[#2a3040] focus-within:ring-2 focus-within:ring-primary">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{initials(c.name)}</div>
                  <div className="min-w-48 flex-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }} className="text-left font-medium hover:underline focus-visible:outline-none" aria-label={`Abrir ${c.name}`}>{c.name}</button>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.projects.length === 0 ? <span className="text-xs text-muted-foreground">Sem projetos</span> : c.projects.map((p) => (
                        <Badge key={p.id} variant="outline" className="border-white/15 text-xs font-normal">{p.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1.5 font-mono text-sm"><Repeat className="h-3.5 w-3.5 text-muted-foreground" />{c.monthly ? `${brl(c.monthly)}/mês` : "Sem recorrência"}</p>
                    <p className="text-xs text-muted-foreground">{c.openCount ? `${brl(c.openAmount)} em aberto` : "Nada em aberto"}</p>
                  </div>
                  <Badge variant="outline" className={STATUS[c.status].cls}>{STATUS[c.status].label}</Badge>
                  <SendClientButton c={c} a={actions} onChoose={chooseClient} />
                </div>

                {c.openCount > 0 && (
                  <div className="border-t border-white/10 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Faturas em aberto</p>
                      <span className="text-xs text-muted-foreground">{c.openCount} pendente(s)</span>
                    </div>
                    <ul className="space-y-2">
                      {c.invoices.filter((i) => i.status === "pending").map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                          <div className="min-w-36 flex-1">
                            <p className="text-sm font-medium">{i.projectName}</p>
                            <p className={cn("text-xs", i.overdue ? "text-danger" : "text-muted-foreground")}>
                              {i.overdue ? "Vencida" : "Vencimento"} · {date(i.dueDate)}
                            </p>
                          </div>
                          <span className="whitespace-nowrap font-mono text-sm font-medium">{brl(i.amount)}</span>
                          {actions.isOwner && (
                            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); actions.onMarkPaid(i); }}>
                              <CheckCircle2 className="h-4 w-4" /> Marcar pago
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-3xl">
          {selected && <ClientDetail c={selected} a={actions} onChoose={chooseClient} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectionClient} onOpenChange={(open) => { if (!open) setSelectionClient(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card sm:max-w-xl">
          {selectionClient && (
            <>
              <DialogHeader>
                <DialogTitle>Selecionar projetos para cobrança</DialogTitle>
                <DialogDescription>Escolha quais projetos de {selectionClient.name} serão registrados como faturas em aberto e enviados em um único e-mail. A recorrência pode estar ligada ou desligada.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="text-sm font-medium">Selecionar todos os projetos</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedProjectIds(allSelected ? [] : selectionClient.projects.map((p) => p.id))}>
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
              <div className="space-y-2">
                {selectionClient.projects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedProjectIds.includes(p.id)} onChange={(e) => toggleProject(p.id, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{KIND[p.kind] ?? p.kind} · cobrança {p.billing ? "ligada" : "desligada"}</span>
                    </span>
                    <span className="whitespace-nowrap font-mono text-sm">{brl(p.fee)}/mês</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">{selectedProjectIds.length} de {selectionClient.projects.length} selecionados</span>
                <span className="font-mono font-semibold">{brl(selectionClient.projects.filter((p) => selectedProjectIds.includes(p.id)).reduce((sum, p) => sum + p.fee, 0))}</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectionClient(null)}>Cancelar</Button>
                <Button type="button" disabled={selectedProjectIds.length === 0 || actions.sendingClient === selectionClient.id} onClick={sendSelected}>
                  <Send className="h-4 w-4" /> Enviar cobrança
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClientDetail({ c, a, onChoose }: { c: ClientRow; a: Actions; onChoose: (c: ClientRow) => void }) {
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">{initials(c.name)}</div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl">{c.name}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
                {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
              </div>
            </DialogDescription>
          </div>
          <Badge variant="outline" className={cn("text-sm", STATUS[c.status].cls)}>{STATUS[c.status].label}</Badge>
        </div>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Recorrência mensal", c.monthly ? `${brl(c.monthly)}/mês` : "—"],
          ["Em aberto", brl(c.openAmount), c.openCount ? `${c.openCount} fatura(s)${c.overdueCount ? ` · ${c.overdueCount} vencida(s)` : ""}` : "Nenhuma pendente"],
          ["Total pago", brl(c.paidTotal), `${c.invoices.filter((i) => i.status === "paid").length} fatura(s)`],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#222733] p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Projetos</h3><SendClientButton c={c} a={a} onChoose={onChoose} /></div>
        {c.projects.length === 0 ? <p className="text-sm text-muted-foreground">Este cliente ainda não tem projetos.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-white/10 bg-[#222733]">
            {c.projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-40 flex-1"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{KIND[p.kind] ?? p.kind} · contrato desde {date(p.contractStart)}</p></div>
                <span className="font-mono">{brl(p.fee)}/mês</span>
                <Badge variant="outline" className={p.billing ? "border-success text-success" : "border-warning text-warning"}>Cobrança {p.billing ? "ligada" : "desligada"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm font-semibold">Histórico de faturas</h3>
        {c.invoices.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fatura registrada para este cliente.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-white/10 bg-[#222733]">
            {c.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{i.projectName}</p>
                  <p className="text-xs text-muted-foreground">Vencimento {date(i.dueDate)}{i.paidAt ? ` · pago em ${new Date(i.paidAt).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
                <span className="w-24 text-right font-mono">{brl(i.amount)}</span>
                <Badge variant="outline" className={i.status === "paid" ? "border-success text-success" : i.overdue ? "border-danger text-danger" : "border-warning text-warning"}>
                  {i.status === "paid" ? "Pago" : i.overdue ? "Vencida" : "A vencer"}
                </Badge>
                {a.isOwner && i.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={a.sendingInvoice === i.id || !c.email} onClick={() => a.onSendInvoice(i, c)}><Send className="h-4 w-4" /> {a.sendingInvoice === i.id ? "Enviando…" : "Enviar"}</Button>
                    <Button size="sm" variant="secondary" onClick={() => a.onMarkPaid(i)}><CheckCircle2 className="h-4 w-4" /> Marcar pago</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
