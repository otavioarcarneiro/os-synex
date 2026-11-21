import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatCard, UptimeLight } from "./ui-bits";

type Summary = { visits: number; conversions: number; last_event: string | null; hours: { hour: number; visits: number }[] };
export const ANALYTICS_SCRIPT_URL = "https://os.synexdigital.com.br/synex-analytics.js";
export const analyticsSnippet = (siteId: string) => `<script defer src="${ANALYTICS_SCRIPT_URL}" data-site-id="${siteId}"></script>`;
export function SiteAnalytics({ project, showCode = false }: { project: { id: string; is_ecommerce: boolean; uptime_status: string; uptime_checked_at: string | null }; showCode?: boolean }) {
  const { data, isPending, error } = useQuery({ queryKey: ["site-analytics", project.id], refetchInterval: 60000,
    queryFn: async () => { const result = await supabase.rpc("site_analytics_summary", { _project: project.id }); if (result.error) throw result.error; return result.data as unknown as Summary; } });
  const code = analyticsSnippet(project.id);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}h`, visits: Number(data?.hours.find((h) => h.hour === hour)?.visits ?? 0) }));
  return <section className="min-w-0 max-w-full space-y-4">
    <h2 className="text-lg font-semibold">Synex Analytics</h2>
    {showCode && <div className="min-w-0 space-y-2"><pre className="max-w-full overflow-x-auto rounded-md border border-border bg-field p-3 text-xs"><code>{code}</code></pre>
      <Button variant="secondary" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(code); toast.success("Código copiado"); } catch { toast.error("Não foi possível copiar"); } }}><Copy className="h-4 w-4" /> Copiar código</Button>
      {project.is_ecommerce && <pre className="overflow-x-auto rounded-md border border-border bg-field p-3 text-xs"><code>{`window.synexAnalytics?.conversion("UUID_UNICO_DA_CONVERSAO");`}</code></pre>}
    </div>}
    {error ? <p className="text-danger">Não foi possível carregar as métricas.</p> : <>
      <div className="grid gap-4 sm:grid-cols-2"><StatCard label="Total de visitas" value={isPending ? "—" : data?.visits ?? 0} />{project.is_ecommerce && <StatCard label="Conversões registradas" value={isPending ? "—" : data?.conversions ?? 0} />}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><UptimeLight status={project.uptime_status} /><span className="text-muted-foreground">{data?.last_event ? `Última coleta: ${new Date(data.last_event).toLocaleString("pt-BR")}` : "Aguardando primeira coleta"}</span></div>
      <h3 className="text-sm font-medium">Visitas por horário · últimos 30 dias · Brasília</h3>
      <div className="h-56 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={hours}><XAxis dataKey="hour" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><Tooltip contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} /><Bar name="Visitas" dataKey="visits" fill="var(--primary)" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer></div>
    </>}
  </section>;
}