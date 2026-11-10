import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, MessageCircle, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { releaseLock } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "./reason-dialog";

type Alert = { id: string; email: string; full_name: string | null; phone: string | null; ip: string | null; geo: string | null; device: string | null; os: string | null; browser: string | null; attempts: number; created_at: string };

export function SecurityAlerts() {
  const qc = useQueryClient();
  const { data: alerts = [] } = useQuery({
    queryKey: ["security_alerts"],
    queryFn: async () => (await supabase.from("security_alerts").select("*").eq("resolved", false).order("created_at", { ascending: false })).data as Alert[] ?? [],
    refetchInterval: 20000,
  });
  const [open, setOpen] = useState<Alert | null>(null);
  const [releasing, setReleasing] = useState(false);
  if (!alerts.length) return null;
  const a = alerts[0];
  const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const wa = (a.phone ?? "").replace(/\D/g, "");
  return (
    <>
      <button onClick={() => setOpen(a)} className="fixed bottom-6 left-6 z-50 w-80 rounded-xl border-2 border-navy-border bg-navy p-4 text-left shadow-2xl animate-in slide-in-from-bottom-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-destructive-foreground"><ShieldAlert className="h-3 w-3" /> BLOQUEIO ADMINISTRATIVO</span>
        <p className="mt-2 font-semibold">{a.full_name || a.email}</p>
        <p className="text-xs text-muted-foreground">{a.attempts} tentativas suspeitas · {fmt(a.created_at)}</p>
        {alerts.length > 1 && <p className="mt-1 text-xs text-muted-foreground">+{alerts.length - 1} alerta(s) pendente(s)</p>}
        <p className="mt-2 text-xs text-primary">Abrir ficha forense →</p>
      </button>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="border-2 border-navy-border bg-navy">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-danger" /> Ficha forense de acesso</DialogTitle></DialogHeader>
          {open && (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd>{open.full_name || "—"}</dd>
              <dt className="text-muted-foreground">E-mail</dt><dd>{open.email}</dd>
              <dt className="text-muted-foreground">Data e hora</dt><dd className="font-mono">{fmt(open.created_at)}</dd>
              <dt className="text-muted-foreground">Hardware</dt><dd>{open.device}</dd>
              <dt className="text-muted-foreground">Sistema</dt><dd>{open.os}</dd>
              <dt className="text-muted-foreground">Navegador</dt><dd>{open.browser}</dd>
              <dt className="text-muted-foreground">IP</dt><dd className="font-mono">{open.ip}</dd>
              <dt className="text-muted-foreground">Localização</dt><dd>{open.geo}</dd>
              <dt className="text-muted-foreground">Tentativas</dt><dd>{open.attempts}</dd>
            </dl>
          )}
          <div className="flex gap-2 pt-2">
            <Button asChild variant="secondary" className="flex-1" disabled={!wa}>
              <a href={wa ? `https://wa.me/${wa.length <= 11 ? "55" + wa : wa}` : undefined} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
            </Button>
            <Button className="flex-1" onClick={() => setReleasing(true)}><Unlock className="h-4 w-4" /> Liberar acesso</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ReasonDialog open={releasing} onOpenChange={setReleasing} title="Liberar acesso" description="Confirme que a identidade foi verificada pelo WhatsApp."
        onConfirm={async (reason) => {
          if (!open) return;
          try { await releaseLock({ data: { alertId: open.id, reason } }); toast.success("Acesso liberado"); setOpen(null); qc.invalidateQueries({ queryKey: ["security_alerts"] }); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
        }} />
    </>
  );
}
