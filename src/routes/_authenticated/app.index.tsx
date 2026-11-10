import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, FolderKanban, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { monthlyFee, brl } from "@/lib/pricing";
import { PageTitle, Panel, StatCard, UptimeLight } from "@/components/synex/ui-bits";

export const Route = createFileRoute("/_authenticated/app/")({ component: Dashboard });

function Dashboard() {
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [projects, invoices, clients] = await Promise.all([
        supabase.from("projects").select("id, name, kind, url, uptime_status, billing_enabled, contract_start, client_id"),
        supabase.from("invoices").select("amount, status, due_date"),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
      ]);
      return { projects: projects.data ?? [], invoices: invoices.data ?? [], clients: clients.data?.length ?? 0 };
    },
  });
  const projects = data?.projects ?? [];
  const mrr = projects.filter((p) => p.billing_enabled).reduce((s, p) => s + monthlyFee(p.contract_start), 0);
  const paid = (data?.invoices ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const pending = (data?.invoices ?? []).filter((i) => i.status === "pending");
  const sites = projects.filter((p) => p.kind === "site");
  const showMoney = me?.primaryRole === "owner" || me?.primaryRole === "partner";
  const first = me?.full_name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageTitle title={`Olá${first ? `, ${first}` : ""}`} subtitle="Visão geral da operação Synex." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clientes" value={data?.clients ?? "—"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Projetos ativos" value={projects.length} hint={`${sites.length} sites · ${projects.length - sites.length} Instagram`} icon={<FolderKanban className="h-4 w-4" />} />
        {showMoney ? (
          <>
            <StatCard label="Recorrência mensal" value={brl(mrr)} hint="Projetos com cobrança ativa" icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Faturamento recebido" value={brl(paid)} hint={`${pending.length} fatura(s) em aberto`} icon={<Wallet className="h-4 w-4" />} />
          </>
        ) : (
          <StatCard label="Sites online" value={`${sites.filter((s) => s.uptime_status === "online").length}/${sites.length}`} icon={<Activity className="h-4 w-4" />} />
        )}
      </div>
      {me?.department !== "juridico" && (
        <Panel title="Monitor de sites">
          {sites.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum site cadastrado ainda.</p> : (
            <ul className="divide-y divide-border">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                  <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.url}</p></div>
                  <UptimeLight status={s.uptime_status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
