import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { generateMonthInvoices, notifyInvoicePaid, sendInvoiceNow } from "@/lib/admin.functions";
import { sendSelectedClientInvoices } from "@/lib/selected-client-invoices.functions";
import { brl, monthlyFee } from "@/lib/pricing";
import { PageTitle, Panel, StatCard, PIX_KEY } from "@/components/synex/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinanceClients } from "@/components/synex/finance-clients";
import { buildClientRows, type ClientInvoice, type ClientRow } from "@/lib/finance-clients";

export const Route = createFileRoute("/_authenticated/app/financeiro")({ head: () => ({ meta: [{ title: "Financeiro — Synex OS" }, { name: "description", content: "Faturas e recorrência da Synex." }, { property: "og:title", content: "Financeiro — Synex OS" }, { property: "og:description", content: "Faturas e recorrência da Synex." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Finance });

function Finance() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isOwner = me?.primaryRole === "owner";
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingClient, setSendingClient] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const [inv, proj, settings, roles] = await Promise.all([
        supabase.from("invoices").select("id,project_id,amount,due_date,status,paid_at").order("due_date", { ascending: false }),
        supabase.from("projects").select("id,name,kind,client_id,billing_enabled,contract_start"),
        supabase.from("system_settings").select("billing_enabled").eq("id", 1).maybeSingle(),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
      ]);
      const projects = proj.data ?? [];
      const ids = [...new Set([...(roles.data ?? []).map((r) => r.user_id), ...projects.map((p) => p.client_id)])];
      const { data: clients } = ids.length ? await supabase.from("profiles").select("id,full_name,email,phone").in("id", ids) : { data: [] };
      return { invoices: inv.data ?? [], projects, clients: clients ?? [], billingOn: settings.data?.billing_enabled ?? false };
    },
  });
  const invoices = data?.invoices ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const mrr = (data?.projects ?? []).filter((p) => p.billing_enabled).reduce((s, p) => s + monthlyFee(p.contract_start), 0);
  const received = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const open = invoices.filter((i) => i.status === "pending");
  const rows = useMemo(() => buildClientRows(data?.clients ?? [], data?.projects ?? [], data?.invoices ?? [], today), [data, today]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  async function sendClient(c: ClientRow, projectIds: string[]) {
    const chosen = c.projects.filter((project) => projectIds.includes(project.id));
    if (!chosen.length) return;
    const monthlyTotal = chosen.reduce((sum, project) => sum + project.fee, 0);
    if (!window.confirm(`Enviar uma cobrança com ${chosen.length} projeto(s), no total de ${brl(monthlyTotal)}, para ${c.name} (${c.email})?`)) return;
    setSendingClient(c.id);
    try {
      const r = await sendSelectedClientInvoices({ data: { clientId: c.id, projectIds } });
      toast.success(`Cobrança de ${r.count} projeto(s) enviada para ${c.name} (${brl(r.total)})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a cobrança");
    } finally {
      setSendingClient(null);
    }
  }

  async function sendOne(i: ClientInvoice, c: ClientRow) {
    if (!window.confirm(`Enviar a fatura de ${i.projectName} agora para ${c.email}?`)) return;
    setSendingInvoice(i.id);
    try { await sendInvoiceNow({ data: { invoiceId: i.id } }); toast.success("Fatura enviada ao cliente"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar a fatura"); }
    finally { setSendingInvoice(null); }
  }

  async function markPaid(i: ClientInvoice) {
    const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Baixa registrada"); refresh();
    notifyInvoicePaid({ data: { invoiceId: i.id } })
      .then((r) => r.sent && toast.success("Agradecimento enviado ao cliente"))
      .catch(() => toast.error("Baixa feita, mas o e-mail de agradecimento falhou"));
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Financeiro & Recorrência" subtitle="Mensalidade R$ 147 (contratos a partir de agosto) ou R$ 200 — virada para R$ 200 em 1º de janeiro."
        action={isOwner && <Button onClick={async () => {
          try { const r = await generateMonthInvoices(); toast.success(`${r.created} fatura(s) gerada(s)`); qc.invalidateQueries({ queryKey: ["finance"] }); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
        }}><Receipt className="h-4 w-4" /> Gerar faturas do mês</Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Recorrência mensal" value={brl(mrr)} />
        <StatCard label="Total recebido" value={brl(received)} />
        <StatCard label="Em aberto" value={brl(open.reduce((s, i) => s + Number(i.amount), 0))} hint={`${open.length} fatura(s)`} />
      </div>
      <Panel title="Clientes e faturas" action={<Badge variant="outline" className={data?.billingOn ? "border-success text-success" : "border-warning text-warning"}>Cobrança automática {data?.billingOn ? "ligada" : "desligada"}</Badge>}>
        <FinanceClients rows={rows} actions={{ isOwner, sendingClient, sendingInvoice, onSendClient: sendClient, onSendInvoice: sendOne, onMarkPaid: markPaid }} />
      </Panel>
      <Panel title="Dados de pagamento">
        <p className="text-sm text-muted-foreground">Chave PIX (e-mail): <span className="font-mono text-foreground">{PIX_KEY}</span> — em nome da responsável legal da Synex Digital Presence.</p>
      </Panel>
    </div>
  );
}
