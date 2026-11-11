import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/synex/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/suporte")({ head: () => ({ meta: [{ title: "Suporte — Synex OS" }, { name: "description", content: "Atendimento aos clientes Synex." }, { property: "og:title", content: "Suporte — Synex OS" }, { property: "og:description", content: "Atendimento aos clientes Synex." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Support });

function Support() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets"], refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      const ids = [...new Set((data ?? []).map((t) => t.client_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
      return (data ?? []).map((t) => ({ ...t, client: profs?.find((p) => p.id === t.client_id) }));
    },
  });
  const { data: msgs = [] } = useQuery({ queryKey: ["smsgs", sel], enabled: !!sel, queryFn: async () => (await supabase.from("support_messages").select("*").eq("ticket_id", sel!).order("created_at")).data ?? [] });
  useEffect(() => {
    const ch = supabase.channel(`sup-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => {
      qc.invalidateQueries({ queryKey: ["smsgs"] }); qc.invalidateQueries({ queryKey: ["tickets"] });
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const ticket = tickets.find((t) => t.id === sel);
  return (
    <div>
      <PageTitle title="Suporte aos clientes" subtitle="Atendimentos iniciados pela IA no Portal do Cliente, com transbordo para você." />
      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <ul className="space-y-2">
          {tickets.length === 0 && <li className="text-sm text-muted-foreground">Nenhum atendimento.</li>}
          {tickets.map((t) => (
            <li key={t.id}><button onClick={() => setSel(t.id)} className={cn("w-full rounded-xl border border-border bg-card p-3 text-left", sel === t.id && "border-primary")}>
              <p className="font-medium">{t.client?.full_name || t.client?.email}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}
                <Badge variant="outline" className={t.status === "human" ? "border-danger text-danger" : t.status === "ai" ? "border-primary text-primary" : ""}>{t.status === "human" ? "Aguardando você" : t.status === "ai" ? "IA" : "Encerrado"}</Badge></div>
            </button></li>
          ))}
        </ul>
        <section className="flex min-h-[480px] flex-col rounded-xl border border-border bg-card">
          {!ticket ? <p className="m-auto text-sm text-muted-foreground">Selecione um atendimento.</p> : (
            <>
              <div className="flex items-center gap-2 border-b border-border p-3">
                <p className="font-semibold">{ticket.client?.full_name || ticket.client?.email}</p>
                <div className="ml-auto flex gap-2">
                  {ticket.status !== "human" && <Button size="sm" variant="secondary" onClick={async () => { await supabase.from("support_tickets").update({ status: "human" }).eq("id", ticket.id); qc.invalidateQueries({ queryKey: ["tickets"] }); }}>Assumir atendimento</Button>}
                  {ticket.status !== "closed" && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("support_tickets").update({ status: "closed" }).eq("id", ticket.id); qc.invalidateQueries({ queryKey: ["tickets"] }); }}>Encerrar</Button>}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={cn("max-w-[75%] rounded-xl px-3 py-2 text-sm", m.role === "user" ? "bg-secondary" : "ml-auto bg-primary/20")}>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{m.role === "assistant" ? <><Bot className="h-3 w-3" /> IA</> : m.role === "agent" ? <><UserRound className="h-3 w-3" /> Você</> : "Cliente"}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault(); if (!text.trim()) return;
                const { error } = await supabase.from("support_messages").insert({ ticket_id: ticket.id, role: "agent", body: text.trim().slice(0, 2000) });
                if (error) return toast.error(error.message);
                if (ticket.status === "ai") await supabase.from("support_tickets").update({ status: "human" }).eq("id", ticket.id);
                setText("");
              }} className="flex gap-2 border-t border-border p-3">
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder ao cliente..." className="bg-field" />
                <Button type="submit"><Send className="h-4 w-4" /></Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
