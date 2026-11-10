import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { generateMonthInvoices } from "@/lib/admin.functions";
import { brl, monthlyFee } from "@/lib/pricing";
import { PageTitle, Panel, StatCard, PIX_KEY } from "@/components/synex/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/financeiro")({ component: Finance });

function Finance() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isOwner = me?.primaryRole === "owner";
  const { data } = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const [inv, proj, settings] = await Promise.all([
        supabase.from("invoices").select("*, project:projects(name, client:profiles!projects_client_id_fkey(full_name, email))").order("due_date", { ascending: false }),
        supabase.from("projects").select("id, billing_enabled, contract_start"),
        supabase.from("system_settings").select("billing_enabled").eq("id", 1).maybeSingle(),
      ]);
      return { invoices: inv.data ?? [], projects: proj.data ?? [], billingOn: settings.data?.billing_enabled ?? false };
    },
  });
  const invoices = data?.invoices ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const mrr = (data?.projects ?? []).filter((p) => p.billing_enabled).reduce((s, p) => s + monthlyFee(p.contract_start), 0);
  const received = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const open = invoices.filter((i) => i.status === "pending");

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
      <Panel title="Faturas" action={<Badge variant="outline" className={data?.billingOn ? "border-success text-success" : "border-warning text-warning"}>Cobrança automática {data?.billingOn ? "ligada" : "desligada"}</Badge>}>
        {invoices.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fatura. Ative a cobrança dos projetos e gere as faturas do mês.</p> : (
          <ul className="divide-y divide-border">
            {invoices.map((i: any) => {
              const overdue = i.status === "pending" && i.due_date < today;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-48 flex-1"><p className="font-medium">{i.project?.name}</p><p className="text-xs text-muted-foreground">{i.project?.client?.full_name || i.project?.client?.email}</p></div>
                  <span className="font-mono text-muted-foreground">{new Date(i.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                  <span className="w-28 text-right font-mono">{brl(Number(i.amount))}</span>
                  <Badge variant="outline" className={i.status === "paid" ? "border-success text-success" : overdue ? "border-danger text-danger" : "border-warning text-warning"}>
                    {i.status === "paid" ? "Pago" : overdue ? "Vencida" : "A vencer"}
                  </Badge>
                  {isOwner && i.status === "pending" && (
                    <Button size="sm" variant="secondary" onClick={async () => {
                      const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", i.id);
                      if (error) return toast.error(error.message);
                      toast.success("Baixa registrada"); qc.invalidateQueries({ queryKey: ["finance"] });
                    }}><CheckCircle2 className="h-4 w-4" /> Marcar pago</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Dados de pagamento">
        <p className="text-sm text-muted-foreground">Chave PIX (e-mail): <span className="font-mono text-foreground">{PIX_KEY}</span> — em nome da responsável legal da Synex Digital Presence.</p>
      </Panel>
    </div>
  );
}
