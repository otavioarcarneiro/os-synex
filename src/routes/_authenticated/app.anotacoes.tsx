import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle } from "@/components/synex/ui-bits";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/anotacoes")({ head: () => ({ meta: [{ title: "Anotações — Synex OS" }, { name: "description", content: "Anotações e prospecção da Synex." }, { property: "og:title", content: "Anotações — Synex OS" }, { property: "og:description", content: "Anotações e prospecção da Synex." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Notes });

function Notes() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"prospect" | "ideia">("prospect");
  const [title, setTitle] = useState(""); const [contact, setContact] = useState(""); const [content, setContent] = useState("");
  const { data: notes = [] } = useQuery({ queryKey: ["notes", kind], queryFn: async () => (await supabase.from("notes").select("*").eq("kind", kind).order("created_at", { ascending: false })).data ?? [] });
  async function add() {
    if (title.trim().length < 2) return toast.error("Informe um título");
    const { error } = await supabase.from("notes").insert({ kind, title: title.trim(), contact: contact.trim() || null, content: content.trim() });
    if (error) return toast.error(error.message);
    setTitle(""); setContact(""); setContent(""); qc.invalidateQueries({ queryKey: ["notes", kind] });
  }
  return (
    <div>
      <PageTitle title="Anotações & Prospecção" />
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="mb-4">
        <TabsList><TabsTrigger value="prospect">Potenciais clientes</TabsTrigger><TabsTrigger value="ideia">Anotações gerais</TabsTrigger></TabsList>
      </Tabs>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <Input placeholder={kind === "prospect" ? "Empresa / nome do prospect" : "Título"} value={title} onChange={(e) => setTitle(e.target.value)} className="bg-field" maxLength={160} />
          {kind === "prospect" && <Input placeholder="Contato (Instagram, site, telefone)" value={contact} onChange={(e) => setContact(e.target.value)} className="bg-field" maxLength={200} />}
          <Textarea placeholder={kind === "prospect" ? "Dados públicos, proposta planejada..." : "Estratégias, ideias..."} value={content} onChange={(e) => setContent(e.target.value)} className="min-h-32 bg-field" maxLength={5000} />
          <Button onClick={add} className="w-full"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>}
          {notes.map((n) => (
            <article key={n.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{n.title}</h3>
                <button aria-label="Excluir" onClick={async () => { await supabase.from("notes").delete().eq("id", n.id); qc.invalidateQueries({ queryKey: ["notes", kind] }); }} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
              {n.contact && <p className="text-xs text-primary">{n.contact}</p>}
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.content}</p>
              <p className="mt-3 text-[11px] text-muted-foreground/60">{new Date(n.created_at).toLocaleDateString("pt-BR")}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
