import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, FileText, ExternalLink, Instagram, Globe, ChartColumn, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { checkUptimeNow } from "@/lib/admin.functions";
import { brl, monthlyFee } from "@/lib/pricing";
import { PageTitle, UptimeLight } from "@/components/synex/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteAnalytics } from "@/components/synex/site-analytics";

export const Route = createFileRoute("/_authenticated/app/projetos")({ head: () => ({ meta: [{ title: "Projetos e Analytics — Synex OS" }, { name: "description", content: "Sites, projetos e métricas próprias da Synex." }, { property: "og:title", content: "Projetos e Analytics — Synex OS" }, { property: "og:description", content: "Sites, projetos e métricas próprias da Synex." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Projects });

function lastCheckLabel(iso: string | null | undefined) {
  if (!iso) return "Nunca verificado";
  const when = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - when.getTime()) / 60000));
  const rel = mins < 1 ? "agora" : mins < 60 ? `há ${mins} min` : mins < 1440 ? `há ${Math.floor(mins / 60)} h` : `há ${Math.floor(mins / 1440)} d`;
  return `Última checagem: ${when.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} (${rel})`;
}

function Projects() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const canWrite = me?.primaryRole === "owner" || (me?.primaryRole === "admin" && me.department === "execucao");
  const isOwner = me?.primaryRole === "owner";
  const [newOpen, setNewOpen] = useState(false);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [docsFor, setDocsFor] = useState<string | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    refetchInterval: 60000,
    queryFn: async () => (await supabase.from("projects").select("*, client:profiles!projects_client_id_fkey(full_name, email)").order("project_number", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })).data ?? [],
  });

  async function check(id?: string) {
    setChecking(true);
    try { await checkUptimeNow({ data: { projectId: id } }); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Verificação concluída"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setChecking(false); }
  }

  const lastOverall = projects.filter((p: any) => p.kind === "site" && p.uptime_checked_at).map((p: any) => p.uptime_checked_at as string).sort().at(-1);

  return (
    <div>
      <PageTitle title="Projetos & Sites" subtitle="Cada cliente pode ter vários sites e perfis de Instagram."
        action={<div className="flex gap-2">
          <Button variant="secondary" onClick={() => check()} disabled={checking}><RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Verificar uptime</Button>
          {canWrite && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Novo projeto</Button>}
        </div>} />
      <p className="mb-3 text-xs text-muted-foreground">{lastOverall ? `Última checagem automática dos sites: ${new Date(lastOverall).toLocaleString("pt-BR")}` : "Nenhum site verificado ainda."}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border"><th className="p-4">Projeto</th><th className="p-4">Cliente</th><th className="p-4">Status</th><th className="p-4">Mensalidade</th><th className="p-4">Cobrança</th><th className="p-4" /></tr>
          </thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum projeto cadastrado.</td></tr>}
            {projects.map((p: any) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="p-4">
                  <p className="flex items-center gap-2 font-medium">{p.kind === "site" ? <Globe className="h-4 w-4 text-primary" /> : <Instagram className="h-4 w-4 text-primary" />}{p.project_number ? `#${p.project_number} · ` : ""}{p.name}</p>
                  {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">{p.url}<ExternalLink className="h-3 w-3" /></a>}
                  {p.instagram_handle && <p className="text-xs text-muted-foreground">@{p.instagram_handle}</p>}
                </td>
                <td className="p-4"><p>{p.client?.full_name || "—"}</p><p className="text-xs text-muted-foreground">{p.client?.email}</p></td>
                <td className="p-4">{p.kind === "site" ? <UptimeLight status={p.uptime_status} /> : <Badge variant="outline">Instagram</Badge>}
                  {p.kind === "site" && <p className="text-xs text-muted-foreground">{lastCheckLabel(p.uptime_checked_at)}</p>}
                  {p.uptime_latency_ms != null && <p className="font-mono text-xs text-muted-foreground">{p.uptime_latency_ms} ms</p>}</td>
                <td className="p-4 font-mono">{brl(monthlyFee(p.contract_start))}<p className="text-xs text-muted-foreground">Setup {brl(Number(p.setup_price))}</p></td>
                <td className="p-4">
                  <Switch checked={p.billing_enabled} disabled={!isOwner} onCheckedChange={async (v) => {
                    const { error } = await supabase.from("projects").update({ billing_enabled: v }).eq("id", p.id);
                    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["projects"] });
                  }} />
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  {p.kind === "site" && <Button size="sm" variant="ghost" onClick={() => check(p.id)}><RefreshCw className="h-4 w-4" /></Button>}
                  {p.kind === "site" && <Button size="sm" variant="ghost" onClick={() => setAnalyticsFor(p.id)}><ChartColumn className="h-4 w-4" /> Analytics</Button>}
                  {canWrite && <Button size="sm" variant="ghost" title="Editar projeto" aria-label="Editar projeto" onClick={() => setEditFor(p.id)}><Pencil className="h-4 w-4" /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => setDocsFor(p.id)}><FileText className="h-4 w-4" /> Docs</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} onCreated={setAnalyticsFor} />
      <EditProjectDialog project={projects.find((p: any) => p.id === editFor) ?? null} onClose={() => setEditFor(null)} isOwner={!!isOwner} />
      <Dialog open={!!analyticsFor} onOpenChange={(v) => !v && setAnalyticsFor(null)}><DialogContent className="min-w-0 max-h-[90vh] overflow-x-hidden overflow-y-auto bg-card sm:max-w-2xl"><DialogHeader><DialogTitle>{projects.find((p) => p.id === analyticsFor)?.name ?? "Projeto criado"}</DialogTitle></DialogHeader>{projects.find((p) => p.id === analyticsFor) && <SiteAnalytics project={projects.find((p) => p.id === analyticsFor) as (typeof projects)[number]} showCode />}</DialogContent></Dialog>
      <DocsDialog projectId={docsFor} onClose={() => setDocsFor(null)} canWrite={!!canWrite} canDelete={isOwner} />
    </div>
  );
}

function EditProjectDialog({ project, onClose, isOwner }: { project: any | null; onClose: () => void; isOwner: boolean }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [f, setF] = useState({
    client_id: "", name: "", kind: "site", url: "", instagram_handle: "",
    publish_status: "em_desenvolvimento", setup_price: "0", contract_start: "",
    billing_enabled: false, ga4_property_id: "", is_ecommerce: false, google_drive_url: "",
  });

  useEffect(() => {
    if (!project) return;
    setF({
      client_id: project.client_id ?? "",
      name: project.name ?? "",
      kind: project.kind ?? "site",
      url: project.url ?? "",
      instagram_handle: project.instagram_handle ?? "",
      publish_status: project.publish_status ?? "em_desenvolvimento",
      setup_price: String(project.setup_price ?? 0),
      contract_start: project.contract_start ?? "",
      billing_enabled: !!project.billing_enabled,
      ga4_property_id: project.ga4_property_id ?? "",
      is_ecommerce: !!project.is_ecommerce,
      google_drive_url: project.google_drive_url ?? "",
    });
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;
    let active = true;
    async function loadClients() {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["client", "owner"]);
      const ids = (roles ?? []).map((x) => x.user_id);
      if (!ids.length) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids).neq("status", "deleted");
      if (active) setClients(data ?? []);
    }
    loadClients();
    return () => { active = false; };
  }, [project?.id]);

  async function save() {
    if (!project) return;
    if (!f.client_id || f.name.trim().length < 2) return toast.error("Selecione o cliente e informe um nome válido.");
    const setupPrice = Number(f.setup_price);
    if (!Number.isFinite(setupPrice) || setupPrice < 0) return toast.error("Informe um valor de setup válido.");
    if (!f.contract_start) return toast.error("Informe o início do contrato.");

    if (f.url.trim()) {
      try {
        const parsed = new URL(f.url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch { return toast.error("Informe uma URL válida começando com https://"); }
    }

    if (f.google_drive_url.trim()) {
      try {
        const parsed = new URL(f.google_drive_url.trim());
        if (parsed.protocol !== "https:") throw new Error();
      } catch { return toast.error("O link do Google Drive deve ser uma URL HTTPS válida."); }
    }

    setSaving(true);
    const updates = {
  client_id: f.client_id,
  name: f.name.trim(),
  kind: f.kind,
  url: f.url.trim() || null,
  instagram_handle: f.instagram_handle.trim().replace(/^@+/, "") || null,
  publish_status: f.publish_status.trim() || "em_desenvolvimento",
  setup_price: setupPrice,
  contract_start: f.contract_start,
  ga4_property_id: f.ga4_property_id.trim() || null,
  is_ecommerce: f.kind === "site" && f.is_ecommerce,
  google_drive_url: f.google_drive_url.trim() || null,
  ...(isOwner ? { billing_enabled: f.billing_enabled } : {}),
};

    const { error } = await supabase.from("projects").update(updates).eq("id", project.id);
    setSaving(false);
    if (error) return toast.error(error.message);

    toast.success("Projeto atualizado.");
    qc.invalidateQueries({ queryKey: ["projects"] });
    onClose();
  }

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-2xl">
        <DialogHeader><DialogTitle>Editar projeto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Cliente</Label>
            <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
              <SelectTrigger className="bg-field"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email || c.id}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Nome do projeto</Label><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} className="bg-field" /></div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                <SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="site">Site</SelectItem><SelectItem value="instagram">Instagram</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1"><Label>URL oficial</Label><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" className="bg-field" /></div>
          <div className="space-y-1"><Label>Perfil do Instagram</Label><Input value={f.instagram_handle} onChange={(e) => setF({ ...f, instagram_handle: e.target.value })} placeholder="@perfil" className="bg-field" /></div>
          <div className="space-y-1"><Label>Status de publicação</Label><Input value={f.publish_status} onChange={(e) => setF({ ...f, publish_status: e.target.value })} placeholder="em_desenvolvimento" className="bg-field" /></div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Setup (R$)</Label><Input type="number" min="0" step="0.01" value={f.setup_price} onChange={(e) => setF({ ...f, setup_price: e.target.value })} className="bg-field" /></div>
            <div className="space-y-1"><Label>Início do contrato</Label><Input type="date" value={f.contract_start} onChange={(e) => setF({ ...f, contract_start: e.target.value })} className="bg-field" /></div>
          </div>

          <div className="space-y-1"><Label>GA4 Property ID</Label><Input value={f.ga4_property_id} onChange={(e) => setF({ ...f, ga4_property_id: e.target.value })} className="bg-field" /></div>
          <div className="space-y-1">
            <Label>Link da pasta Google Drive (opcional)</Label>
            <Input value={f.google_drive_url} onChange={(e) => setF({ ...f, google_drive_url: e.target.value })} placeholder="https://drive.google.com/..." className="bg-field" />
            <p className="text-xs text-muted-foreground">Deixe vazio para remover o link salvo.</p>
          </div>

          <label className="flex items-center justify-between text-sm">E-commerce<Switch checked={f.is_ecommerce} onCheckedChange={(v) => setF({ ...f, is_ecommerce: v })} disabled={f.kind !== "site"} /></label>

          {isOwner && <label className="flex items-center justify-between border-t border-border pt-3 text-sm">Cobrança habilitada<Switch checked={f.billing_enabled} onCheckedChange={(v) => setF({ ...f, billing_enabled: v })} /></label>}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ client_id: "", name: "", kind: "site", url: "", instagram_handle: "", setup_price: "0", contract_start: new Date().toISOString().slice(0, 10), is_ecommerce: false });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"], enabled: open,
    queryFn: async () => {
      const { data: r } = await supabase.from("user_roles").select("user_id").in("role", ["client", "owner"]);
      const ids = (r ?? []).map((x) => x.user_id);
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id, full_name, email").in("id", ids).neq("status", "deleted")).data ?? [];
    },
  });
  async function save() {
    if (!f.client_id || f.name.trim().length < 2) return toast.error("Selecione o cliente e informe o nome.");
    if (f.kind === "site" && f.url && !/^https?:\/\//.test(f.url)) return toast.error("A URL deve começar com https://");
    const { error, data: created } = await supabase.from("projects").insert({
      client_id: f.client_id, name: f.name.trim(), kind: f.kind, url: f.url || null, instagram_handle: f.instagram_handle.replace("@", "") || null,
      setup_price: Number(f.setup_price) || 0, contract_start: f.contract_start, is_ecommerce: f.kind === "site" && f.is_ecommerce,
    }).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Projeto criado (cobrança desligada por padrão)");
    qc.invalidateQueries({ queryKey: ["projects"] });
    onOpenChange(false);
    if (created && f.kind === "site") onCreated(created.id);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Cliente</Label>
            <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
              <SelectTrigger className="bg-field"><SelectValue placeholder={clients.length ? "Selecione" : "Cadastre um cliente na Área Restrita"} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="bg-field" maxLength={120} /></div>
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                <SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="site">Site</SelectItem><SelectItem value="instagram">Instagram</SelectItem></SelectContent>
              </Select></div>
          </div>
          {f.kind === "site"
            ? <div className="space-y-1"><Label>URL oficial</Label><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" className="bg-field" /></div>
            : <div className="space-y-1"><Label>Perfil do Instagram</Label><Input value={f.instagram_handle} onChange={(e) => setF({ ...f, instagram_handle: e.target.value })} placeholder="@perfil" className="bg-field" /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Setup (R$)</Label><Input type="number" min="0" value={f.setup_price} onChange={(e) => setF({ ...f, setup_price: e.target.value })} className="bg-field" /></div>
            <div className="space-y-1"><Label>Início do contrato</Label><Input type="date" value={f.contract_start} onChange={(e) => setF({ ...f, contract_start: e.target.value })} className="bg-field" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Mensalidade calculada: <span className="font-mono">{brl(monthlyFee(f.contract_start))}</span></p>
          {f.kind === "site" && <label className="flex items-center justify-between text-sm">E-commerce<Switch checked={f.is_ecommerce} onCheckedChange={(v) => setF({ ...f, is_ecommerce: v })} /></label>}
          <Button className="w-full" onClick={save}>Criar projeto</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocsDialog({ projectId, onClose, canWrite, canDelete }: { projectId: string | null; onClose: () => void; canWrite: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [kind, setKind] = useState("relatorio");
  const { data: docs = [] } = useQuery({
    queryKey: ["docs", projectId], enabled: !!projectId,
    queryFn: async () => projectId ? (await supabase.from("project_documents").select("*").eq("project_id", projectId).order("created_at", { ascending: false })).data ?? [] : [],
  });
  return (
    <Dialog open={!!projectId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle>Documentos do projeto</DialogTitle></DialogHeader>
        <ul className="space-y-2">
          {docs.length === 0 && <li className="text-sm text-muted-foreground">Nenhum documento.</li>}
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <a href={d.url} target="_blank" rel="noreferrer" className="hover:text-primary">{d.title}</a>
              <div className="flex items-center gap-2"><Badge variant="outline" className="capitalize">{d.kind}</Badge>
                {canDelete && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("project_documents").delete().eq("id", d.id); qc.invalidateQueries({ queryKey: ["docs", projectId] }); }}>Remover</Button>}</div>
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="space-y-2 border-t border-border pt-4">
            <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-field" />
            <Input placeholder="Link do arquivo (https://)" value={url} onChange={(e) => setUrl(e.target.value)} className="bg-field" />
            <div className="flex gap-2">
              <Select value={kind} onValueChange={setKind}><SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="proposta">Proposta</SelectItem><SelectItem value="contrato">Contrato</SelectItem><SelectItem value="relatorio">Relatório</SelectItem></SelectContent></Select>
              <Button onClick={async () => {
                if (!projectId || !title.trim() || !/^https?:\/\//.test(url)) return toast.error("Informe título e link válido");
                const { error } = await supabase.from("project_documents").insert({ project_id: projectId, title: title.trim(), url, kind });
                if (error) return toast.error(error.message);
                setTitle(""); setUrl(""); qc.invalidateQueries({ queryKey: ["docs", projectId] });
              }}>Adicionar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
