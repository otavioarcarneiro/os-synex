import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTwoFactorRequests, releaseTwoFactor } from "@/lib/admin.functions";
import { Bell, CreditCard, Headset, Globe, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/synex/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  KIND_LABEL, invoiceNotifications, loginNotifications, sacNotifications, sortNotifications, uptimeNotifications,
  type NotificationItem, type NotificationKind, type Severity,
} from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/app/notificacoes")({ head: () => ({ meta: [{ title: "Notificações — Synex OS" }, { name: "description", content: "Central de notificações da Synex." }, { property: "og:title", content: "Notificações — Synex OS" }, { property: "og:description", content: "Central de notificações da Synex." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Notifications });

const ICON = { uptime: Globe, login: ShieldAlert, invoice: CreditCard, sac: Headset } as const;
const ACCENT: Record<Severity, string> = { danger: "border-l-danger", warning: "border-l-warning", success: "border-l-success", info: "border-l-primary" };
const BADGE: Record<Severity, string> = { danger: "border-danger text-danger", warning: "border-warning text-warning", success: "border-success text-success", info: "border-primary text-primary" };
const KINDS: NotificationKind[] = ["uptime", "login", "invoice", "sac"];

function Notifications() {
  const [filter, setFilter] = useState<NotificationKind | "all">("all");
  const qc = useQueryClient();
  const [releasing, setReleasing] = useState<string | null>(null);
  const { data: items = [], isPending, error } = useQuery({
    queryKey: ["notifications"], refetchInterval: 30000,
    queryFn: async (): Promise<NotificationItem[]> => {
      const requests = await listTwoFactorRequests().catch(() => []);
      const [sites, alerts, invoices, tickets] = await Promise.all([
        supabase.from("projects").select("id,name,url,uptime_status,uptime_checked_at").eq("kind", "site").in("uptime_status", ["down", "warning"]),
        supabase.from("security_alerts").select("id,email,full_name,attempts,created_at,lock_scope,resolved").order("created_at", { ascending: false }).limit(50),
        supabase.from("invoices").select("id,amount,due_date,reminder_sent_at,due_notice_sent_at,thanks_sent_at,project:projects(name,client:profiles!projects_client_id_fkey(full_name,email))")
          .or("reminder_sent_at.not.is.null,due_notice_sent_at.not.is.null,thanks_sent_at.not.is.null").order("due_date", { ascending: false }).limit(50),
        supabase.from("support_tickets").select("id,status,created_at,client_id").order("created_at", { ascending: false }).limit(50),
      ]);
      const clientIds = [...new Set((tickets.data ?? []).map((t) => t.client_id))];
      const { data: profs } = clientIds.length ? await supabase.from("profiles").select("id,full_name,email").in("id", clientIds) : { data: [] };
      const withClient = (tickets.data ?? []).map((t) => ({ ...t, client: profs?.find((p) => p.id === t.client_id) ?? null }));
      return sortNotifications([
        ...uptimeNotifications(sites.data ?? []),
        ...loginNotifications(alerts.data ?? []),
        ...invoiceNotifications((invoices.data ?? []) as never),
        ...sacNotifications(withClient, requests),
      ]);
    },
  });
  const count = (k: NotificationKind) => items.filter((i) => i.kind === k).length;
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  return (
    <div className="space-y-6">
      <PageTitle title="Central de Notificações" subtitle="Incidentes de uptime, bloqueios de login, faturas enviadas e pedidos do SAC em um só lugar." />
      <div className="flex flex-wrap gap-2">
        {(["all", ...KINDS] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", filter === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-secondary")}>
            {k === "all" ? "Todas" : KIND_LABEL[k]} <span className="ml-1 font-mono text-xs">{k === "all" ? items.length : count(k)}</span>
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">Não foi possível carregar as notificações.</p>
        : isPending ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : shown.length === 0 ? <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-12 text-sm text-muted-foreground"><Bell className="h-6 w-6" />Nenhuma notificação.</div>
        : (
          <ul className="space-y-3">
            {shown.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <li key={n.id}>
                  {n.twoFactorUserId ? (
                    <div className={cn("flex items-start gap-3 rounded-xl border border-white/10 border-l-4 bg-[#222733] p-4 shadow-sm", ACCENT[n.severity])}>
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{n.title}</p><Badge variant="outline" className={BADGE[n.severity]}>{KIND_LABEL[n.kind]}</Badge></div>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{n.detail}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" disabled={releasing === n.twoFactorUserId} onClick={async () => {
                            if (!window.confirm("Liberar o acesso deste colaborador? Ele poderá entrar uma vez sem o código por e-mail, nos próximos 30 minutos (a senha continua exigida). Só libere se você reconhecer o pedido.")) return;
                            setReleasing(n.twoFactorUserId!);
                            try { await releaseTwoFactor({ data: { userId: n.twoFactorUserId! } }); toast.success("Acesso liberado por 30 minutos"); await qc.invalidateQueries({ queryKey: ["notifications"] }); }
                            catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível liberar"); }
                            finally { setReleasing(null); }
                          }}>{releasing === n.twoFactorUserId ? "Liberando…" : "Liberar acesso"}</Button>
                          <Button size="sm" variant="outline" asChild><Link to={n.href}>Abrir atendimento</Link></Button>
                        </div>
                      </div>
                      {n.at && <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(n.at).toLocaleString("pt-BR")}</span>}
                    </div>
                  ) : (
                  <Link to={n.href} className={cn("flex items-start gap-3 rounded-xl border border-white/10 border-l-4 bg-[#222733] p-4 shadow-sm transition-colors hover:bg-[#2a3040]", ACCENT[n.severity])}>
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{n.title}</p><Badge variant="outline" className={BADGE[n.severity]}>{KIND_LABEL[n.kind]}</Badge></div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">{n.detail}</p>
                    </div>
                    {n.at && <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(n.at).toLocaleString("pt-BR")}</span>}
                  </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
