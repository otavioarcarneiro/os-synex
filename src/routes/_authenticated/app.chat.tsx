import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Lock, Megaphone, Send, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/chat")({ component: Chat });

const dmSlug = (a: string, b: string) => "dm:" + [a, b].sort().join(":");

function Chat() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isOwner = me?.primaryRole === "owner";
  const [channel, setChannel] = useState("geral");
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const { data: channels = [] } = useQuery({ queryKey: ["channels"], queryFn: async () => (await supabase.from("chat_channels").select("*").order("slug")).data ?? [] });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data: r } = await supabase.from("user_roles").select("user_id, role").in("role", ["owner", "partner", "admin"]);
      const ids = [...new Set((r ?? []).map((x) => x.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", ids).eq("status", "active")).data ?? [];
    },
  });
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.full_name || staff.find((s) => s.id === id)?.email || "Usuário";
  const { data: messages = [] } = useQuery({
    queryKey: ["messages", channel],
    queryFn: async () => (await supabase.from("messages").select("*").eq("channel", channel).order("created_at").limit(300)).data ?? [],
  });
  const { data: dmChannels = [] } = useQuery({
    queryKey: ["dm-audit"], enabled: isOwner,
    queryFn: async () => [...new Set(((await supabase.from("messages").select("channel").like("channel", "dm:%").limit(1000)).data ?? []).map((m) => m.channel))],
  });

  useEffect(() => {
    const ch = supabase.channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        qc.invalidateQueries({ queryKey: ["messages", (p.new as { channel: string }).channel] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, channel]);

  const current = channels.find((c) => c.slug === channel);
  const readOnly = !isOwner && (current?.frozen || current?.announcement_only);
  const isDm = channel.startsWith("dm:");
  const dmTitle = isDm ? channel.slice(3).split(":").filter((id) => id !== me?.id).map(nameOf).join(" ↔ ") || "Anotações pessoais" : "";

  async function send() {
    if (!text.trim() || !me) return;
    const { error } = await supabase.from("messages").insert({ channel, sender_id: me.id, body: text.trim().slice(0, 4000) });
    if (error) return toast.error("Mensagem não enviada: " + error.message);
    setText("");
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] gap-4 md:grid-cols-[240px_1fr]">
      <aside className="space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-3">
        <div>
          <p className="px-2 pb-1 text-xs uppercase text-muted-foreground">Canais</p>
          {channels.map((c) => (
            <button key={c.slug} onClick={() => setChannel(c.slug)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", channel === c.slug ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary")}>
              <Hash className="h-4 w-4" />{c.name}{c.frozen && <Snowflake className="ml-auto h-3 w-3" />}{c.announcement_only && <Megaphone className="ml-auto h-3 w-3" />}
            </button>
          ))}
        </div>
        <div>
          <p className="px-2 pb-1 text-xs uppercase text-muted-foreground">Mensagens diretas</p>
          {staff.filter((s) => s.id !== me?.id).map((s) => {
            const slug = me ? dmSlug(me.id, s.id) : "";
            return <button key={s.id} onClick={() => setChannel(slug)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", channel === slug ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary")}>
              <span className="h-2 w-2 rounded-full bg-success" />{s.full_name || s.email}</button>;
          })}
        </div>
        {isOwner && dmChannels.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-xs uppercase text-muted-foreground">Supervisão de DMs</p>
            {dmChannels.filter((c) => !me || !c.includes(me.id)).map((c) => (
              <button key={c} onClick={() => setChannel(c)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs", channel === c ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary")}>
                <Lock className="h-3 w-3 shrink-0" />{c.slice(3).split(":").map(nameOf).join(" ↔ ")}</button>
            ))}
          </div>
        )}
      </aside>
      <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <p className="font-semibold">{isDm ? dmTitle : `# ${current?.name ?? channel}`}</p>
          {isOwner && current && (
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">Congelar <Switch checked={current.frozen} onCheckedChange={async (v) => { await supabase.from("chat_channels").update({ frozen: v }).eq("slug", current.slug); qc.invalidateQueries({ queryKey: ["channels"] }); }} /></label>
              <label className="flex items-center gap-2">Modo comunicado <Switch checked={current.announcement_only} onCheckedChange={async (v) => { await supabase.from("chat_channels").update({ announcement_only: v }).eq("slug", current.slug); qc.invalidateQueries({ queryKey: ["channels"] }); }} /></label>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn("max-w-[75%] rounded-xl px-4 py-2 text-sm", m.sender_id === me?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary")}>
              <p className="text-[11px] opacity-70">{nameOf(m.sender_id)} · {new Date(m.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-border p-3">
          <Input value={text} onChange={(e) => setText(e.target.value)} disabled={readOnly} placeholder={readOnly ? "Canal somente leitura" : "Escreva uma mensagem..."} className="bg-field" maxLength={4000} />
          <Button type="submit" disabled={readOnly || !text.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </section>
    </div>
  );
}
