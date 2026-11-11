import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { sendSupportMessage } from "@/lib/support.functions";
import { brl } from "@/lib/pricing";
import { SynexLogo } from "@/components/synex/brand";
import { UserMenu } from "@/components/synex/user-menu";
import { SessionGuard } from "@/components/synex/session-guard";
import { Panel, UptimeLight, PIX_KEY } from "@/components/synex/ui-bits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteAnalytics } from "@/components/synex/site-analytics";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Portal do Cliente — Synex" }, { name: "description", content: "Acompanhe seus projetos com a Synex." }, { property: "og:title", content: "Portal do Cliente — Synex" }, { property: "og:description", content: "Acompanhe seus projetos com a Synex." }] }),
  component: Portal,
});

function Portal() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: projects = [] } = useQuery({ queryKey: ["my-projects"], queryFn: async () => (await supabase.from("projects").select("*").order("created_at")).data ?? [] });
  const [sel, setSel] = useState<string>("");
  const p = projects.find((x) => x.id === sel) ?? projects[0];
  const { data: docs = [] } = useQuery({ queryKey: ["pdocs", p?.id], enabled: !!p, queryFn: async () => (await supabase.from("project_documents").select("*").eq("project_id", p!.id)).data ?? [] });
  const { data: invoices = [] } = useQuery({ queryKey: ["pinv", p?.id], enabled: !!p, queryFn: async () => (await supabase.from("invoices").select("*").eq("project_id", p!.id).order("due_date", { ascending: false })).data ?? [] });
  return (
    <div className="min-h-screen bg-canvas">
      <SessionGuard />
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-8">
        <SynexLogo className="w-32" />
        {projects.length > 0 && (
          <Select value={p?.id} onValueChange={setSel}>
            <SelectTrigger className="w-48 max-w-full bg-field"><SelectValue /></SelectTrigger>
            <SelectContent>{projects.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2">{me?.primaryRole === "owner" && <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/app" })}>Voltar para o CRM</Button>}<UserMenu /></div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <h1 className="text-2xl font-semibold">Olá{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}</h1>
        {!p ? <p className="text-muted-foreground">Seus projetos aparecerão aqui assim que a Synex os cadastrar.</p> : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Projeto"><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{p.url ?? (p.instagram_handle ? "@" + p.instagram_handle : "")}</p><Badge variant="outline" className="mt-2">{p.publish_status.replace("_", " ")}</Badge></Panel>
              <Panel title="Status do site">{p.kind === "site" ? <UptimeLight status={p.uptime_status} /> : <p className="text-sm text-muted-foreground">Perfil de Instagram</p>}</Panel>
              <Panel title="Monitoramento"><p className="text-sm text-muted-foreground">{p.uptime_checked_at ? new Date(p.uptime_checked_at).toLocaleString("pt-BR") : "Aguardando verificação"}</p></Panel>
            </div>
            {p.kind === "site" && <SiteAnalytics project={p} />}
            <Panel title="Documentos">
              {docs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento.</p> : docs.map((d) => <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="block py-1 text-sm hover:text-primary">{d.title}</a>)}
            </Panel>
            <Panel title="Faturas">
              {invoices.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fatura.</p> : invoices.map((i) => (
                <div key={i.id} className="flex justify-between py-1 text-sm"><span className="font-mono">{new Date(i.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</span><span className="font-mono">{brl(Number(i.amount))}</span><Badge variant="outline">{i.status === "paid" ? "Pago" : "Em aberto"}</Badge></div>
              ))}
              <p className="mt-3 text-xs text-muted-foreground">PIX: <span className="font-mono">{PIX_KEY}</span></p>
            </Panel>
          </>
        )}
      </main>
      {me && <SupportWidget userId={me.id} />}
    </div>
  );
}

function SupportWidget({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: ticket } = useQuery({ queryKey: ["my-ticket"], enabled: open, queryFn: async () => (await supabase.from("support_tickets").select("*").neq("status", "closed").order("created_at", { ascending: false }).limit(1).maybeSingle()).data });
  const { data: msgs = [] } = useQuery({ queryKey: ["my-smsgs", ticket?.id], enabled: !!ticket, queryFn: async () => (await supabase.from("support_messages").select("*").eq("ticket_id", ticket!.id).order("created_at")).data ?? [] });
  useEffect(() => {
    if (!ticket) return;
    const ch = supabase.channel(`w-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => qc.invalidateQueries({ queryKey: ["my-smsgs"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticket, qc]);
  async function send(human = false) {
    const body = human ? "Quero falar com o Otávio." : text.trim();
    if (!body) return;
    setBusy(true);
    let t = ticket;
    if (!t) { t = (await supabase.from("support_tickets").insert({ client_id: userId }).select().single()).data; qc.invalidateQueries({ queryKey: ["my-ticket"] }); }
    if (t) await sendSupportMessage({ data: { ticketId: t.id, body, human } });
    setText(""); setBusy(false); qc.invalidateQueries({ queryKey: ["my-smsgs"] });
  }
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Suporte" className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-glow">
        {open ? <X /> : <MessageCircle />}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[460px] w-80 flex-col rounded-xl border border-border bg-card shadow-2xl">
          <p className="border-b border-border p-3 text-sm font-semibold">Suporte Synex</p>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {msgs.length === 0 && <p className="text-muted-foreground">Olá! Como podemos ajudar?</p>}
            {msgs.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "max-w-[85%] rounded-lg bg-secondary px-3 py-2"}>{m.body}</div>)}
            {busy && <p className="text-xs text-muted-foreground">Digitando...</p>}
          </div>
          <button onClick={() => send(true)} className="px-3 text-left text-xs text-primary">Falar com o Otávio</button>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 p-3">
            <Input value={text} onChange={(e) => setText(e.target.value)} className="bg-field" maxLength={2000} />
            <Button type="submit" size="icon" disabled={busy}><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
