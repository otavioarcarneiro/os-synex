import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, ROLE_LABEL, DEPT_LABEL, type Role } from "@/hooks/use-me";
import { changePin, createUser, sudoStatus, userAction, verifySudo } from "@/lib/admin.functions";
import { PageTitle, Panel } from "@/components/synex/ui-bits";
import { ReasonDialog } from "@/components/synex/reason-dialog";
import { UserAvatar } from "@/components/synex/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/restrita")({ component: Restricted });
const SUDO = "synex_sudo_until";
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");

function Restricted() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(Number(sessionStorage.getItem(SUDO) ?? 0) > Date.now()); }, []);
  if (me && me.primaryRole !== "owner") return <p className="text-sm text-muted-foreground">Área exclusiva do proprietário.</p>;
  if (!unlocked) return <SudoGate onOk={() => { sessionStorage.setItem(SUDO, String(Date.now() + 15 * 60000)); setUnlocked(true); }} onBack={() => navigate({ to: "/app" })} />;
  return (
    <div className="space-y-6">
      <PageTitle title="Área Restrita" subtitle="Governança da Synex. A sessão restrita expira em 15 minutos."
        action={<Button variant="ghost" onClick={() => { sessionStorage.removeItem(SUDO); navigate({ to: "/app" }); }}><ArrowLeft className="h-4 w-4" /> Voltar</Button>} />
      <Toggles />
      <Users />
      <Audit />
      <PinChange />
    </div>
  );
}

function SudoGate({ onOk, onBack }: { onOk: () => void; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState(""); const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: status } = useQuery({ queryKey: ["sudo-status"], queryFn: () => sudoStatus() });
  return (
    <Dialog open onOpenChange={(v) => !v && onBack()}>
      <DialogContent className="border-2 border-navy-border bg-navy">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Área Restrita — Confirmação de Identidade</DialogTitle>
          <DialogDescription>Etapa {step} de 2 · {step === 1 ? "Revalide sua senha" : status?.hasPin ? "Informe o PIN mestre" : "Defina seu PIN mestre (4 a 8 dígitos)"}</DialogDescription>
        </DialogHeader>
        {step === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); if (password) setStep(2); }} className="space-y-3">
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha do proprietário" className="bg-field" />
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button><Button type="submit" className="flex-1">Continuar</Button></div>
          </form>
        ) : (
          <form onSubmit={async (e) => {
            e.preventDefault(); setLoading(true);
            try { const r = await verifySudo({ data: { password, pin } }); if (r.created) toast.success("PIN mestre definido"); onOk(); }
            catch (x) { err(x); setStep(1); setPin(""); } finally { setLoading(false); }
          }} className="space-y-3">
            <Input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" className="bg-field text-center font-mono text-2xl tracking-[0.5em]" />
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button><Button type="submit" disabled={loading || pin.length < 4} className="flex-1">{loading ? "Verificando..." : "Entrar"}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Toggles() {
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("system_settings").select("maintenance_mode, billing_enabled, uptime_enabled").eq("id", 1).single()).data });
  const set = async (k: string, v: boolean) => {
    const { error } = await supabase.from("system_settings").update({ [k]: v, updated_at: new Date().toISOString() } as never).eq("id", 1);
    if (error) return err(error); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Configuração salva");
  };
  const rows = [
    { k: "maintenance_mode", t: "Modo manutenção do CRM", d: "Bloqueia o login de clientes e equipe. Seu acesso continua liberado." },
    { k: "billing_enabled", t: "Cobrança automática", d: "Ativa ou pausa os e-mails de recorrência." },
    { k: "uptime_enabled", t: "Monitor de uptime", d: "Verificação automática dos sites a cada 30 minutos." },
  ] as const;
  return (
    <Panel title="Controles do sistema">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center justify-between gap-4 py-3">
            <div><p className="font-medium">{r.t}</p><p className="text-sm text-muted-foreground">{r.d}</p></div>
            <Switch checked={!!s?.[r.k]} onCheckedChange={(v) => set(r.k, v)} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type UserRow = { id: string; full_name: string; email: string; phone: string | null; avatar_url: string | null; department: "juridico" | "execucao" | null; status: string; created_at: string; role: Role | null };
const OWNER_EMAILS = ["otavio.arcarneiro@gmail.com", "synex.presence@gmail.com"];

function badgeFor(u: UserRow) {
  if (u.role === "admin" && u.department) return DEPT_LABEL[u.department];
  return u.role ? ROLE_LABEL[u.role] : "Sem papel";
}

function Users() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("todos");
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [toggle, setToggle] = useState<UserRow | null>(null);
  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([supabase.from("profiles").select("*").neq("status", "deleted").order("full_name"), supabase.from("user_roles").select("user_id, role")]);
      return (p ?? []).map((x) => ({ ...x, role: (r?.find((y) => y.user_id === x.id)?.role ?? null) as Role | null })) as UserRow[];
    },
  });
  const list = useMemo(() => users.filter((u) => tab === "todos" ? true : tab === "clientes" ? u.role === "client" : u.role === "admin" && u.department === tab), [users, tab]);
  return (
    <Panel title="Usuários & Permissões" action={<Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Adicionar usuário</Button>}>
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="execucao">Execução</TabsTrigger><TabsTrigger value="juridico">Jurídico</TabsTrigger><TabsTrigger value="clientes">Clientes</TabsTrigger></TabsList>
      </Tabs>
      <ul className="divide-y divide-border">
        {list.map((u) => {
          const owner = OWNER_EMAILS.includes(u.email.toLowerCase());
          return (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <UserAvatar me={u} className="h-9 w-9" />
              <button className="min-w-0 flex-1 text-left" onClick={() => setDetail(u)}>
                <p className="truncate font-medium">{u.full_name || "Sem nome"}</p>
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="truncate">{u.email}</span>
                  <Badge variant="outline" className="border-primary/60 text-primary">{badgeFor(u)}</Badge>
                  {u.status === "suspended" && <Badge variant="outline" className="border-warning text-warning">Suspenso</Badge>}</p>
              </button>
              <Switch checked={u.status === "active"} disabled={owner} onCheckedChange={() => setToggle(u)} aria-label="Ligar/desligar acesso" />
            </li>
          );
        })}
      </ul>
      <ReasonDialog open={!!toggle} onOpenChange={(v) => !v && setToggle(null)}
        title={toggle?.status === "active" ? "Suspender conta" : "Reativar conta"}
        description={toggle?.status === "active" ? "O login será bloqueado e a sessão encerrada. Histórico, projetos e faturas são preservados." : "O usuário poderá entrar novamente."}
        destructive={toggle?.status === "active"}
        onConfirm={async (reason) => {
          if (!toggle) return;
          try { await userAction({ data: { targetId: toggle.id, action: toggle.status === "active" ? "suspend" : "reactivate", reason } }); toast.success("Ação registrada"); qc.invalidateQueries({ queryKey: ["admin-users"] }); }
          catch (e) { err(e); }
        }} />
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <UserDetail user={detail} onClose={() => setDetail(null)} />
    </Panel>
  );
}

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", email: "", phone: "", role: "client" as "client" | "partner" | "admin", department: "execucao" as "execucao" | "juridico", reason: "" });
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle>Adicionar usuário</DialogTitle><DialogDescription>Um convite será enviado por e-mail para a pessoa definir a senha.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome completo</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} className="bg-field" maxLength={120} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="bg-field" /></div>
            <div className="space-y-1"><Label>WhatsApp</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="bg-field" maxLength={30} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Perfil</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as typeof f.role })}><SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="client">Cliente</SelectItem><SelectItem value="admin">Administrador</SelectItem><SelectItem value="partner">Sócio</SelectItem></SelectContent></Select></div>
            {f.role === "admin" && <div className="space-y-1"><Label>Departamento</Label>
              <Select value={f.department} onValueChange={(v) => setF({ ...f, department: v as typeof f.department })}><SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="execucao">Execução</SelectItem><SelectItem value="juridico">Jurídico</SelectItem></SelectContent></Select></div>}
          </div>
          <div className="space-y-1"><Label>Motivo (auditoria)</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex.: novo cliente — contrato site institucional" className="bg-field" /></div>
          <Button className="w-full" disabled={loading} onClick={async () => {
            setLoading(true);
            try {
              await createUser({ data: { ...f, phone: f.phone || undefined, department: f.role === "admin" ? f.department : null, origin: window.location.origin } });
              toast.success("Convite enviado"); qc.invalidateQueries({ queryKey: ["admin-users"] }); onOpenChange(false);
              setF({ full_name: "", email: "", phone: "", role: "client", department: "execucao", reason: "" });
            } catch (e) { err(e); } finally { setLoading(false); }
          }}>{loading ? "Enviando..." : "Enviar convite"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserDetail({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<null | "delete" | "role_change" | "revoke_sessions">(null);
  const [role, setRole] = useState<"client" | "partner" | "admin">("client");
  const [dept, setDept] = useState<"execucao" | "juridico">("execucao");
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("active_sessions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false })).data ?? [] });
  const owner = !!user && OWNER_EMAILS.includes(user.email.toLowerCase());
  return (
    <Sheet open={!!user} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader><SheetTitle>Ficha do usuário</SheetTitle></SheetHeader>
        {user && (
          <div className="space-y-5 px-4 pb-8">
            <div className="flex items-center gap-3"><UserAvatar me={user} className="h-14 w-14" /><div><p className="font-semibold">{user.full_name}</p><p className="text-sm text-muted-foreground">{user.email}</p><Badge variant="outline" className="mt-1 border-primary/60 text-primary">{badgeFor(user)}</Badge></div></div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm"><dt className="text-muted-foreground">WhatsApp</dt><dd>{user.phone || "—"}</dd><dt className="text-muted-foreground">Status</dt><dd>{user.status}</dd><dt className="text-muted-foreground">Cadastro</dt><dd>{new Date(user.created_at).toLocaleString("pt-BR")}</dd></dl>
            <div>
              <p className="mb-2 text-sm font-semibold">Dispositivos conectados</p>
              {sessions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma sessão ativa.</p> : (
                <ul className="space-y-2">{sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-xs">
                    <div><p className="font-medium">{s.device} · {s.browser}</p><p className="text-muted-foreground">{s.os} · {s.ip} · {new Date(s.created_at).toLocaleString("pt-BR")}</p></div>
                    <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("active_sessions").delete().eq("id", s.id); qc.invalidateQueries({ queryKey: ["sessions", user.id] }); toast.success("Sessão revogada"); }}>Revogar</Button>
                  </li>))}</ul>)}
              {sessions.length > 0 && <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => setAction("revoke_sessions")}>Revogar todos os dispositivos</Button>}
            </div>
            {owner ? <p className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary"><ShieldCheck className="h-4 w-4" /> Conta proprietária blindada.</p> : (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-semibold">Ações críticas</p>
                <div className="flex gap-2">
                  <Select value={role} onValueChange={(v) => setRole(v as typeof role)}><SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="client">Cliente</SelectItem><SelectItem value="admin">Administrador</SelectItem><SelectItem value="partner">Sócio</SelectItem></SelectContent></Select>
                  {role === "admin" && <Select value={dept} onValueChange={(v) => setDept(v as typeof dept)}><SelectTrigger className="bg-field"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="execucao">Execução</SelectItem><SelectItem value="juridico">Jurídico</SelectItem></SelectContent></Select>}
                  <Button variant="secondary" onClick={() => setAction("role_change")}>Alterar</Button>
                </div>
                <Button variant="destructive" className="w-full" onClick={() => setAction("delete")}>Remover conta definitivamente</Button>
              </div>
            )}
          </div>
        )}
        <ReasonDialog open={!!action} onOpenChange={(v) => !v && setAction(null)} destructive={action === "delete"}
          title={action === "delete" ? "Remover conta" : action === "role_change" ? "Alterar papel" : "Revogar sessões"}
          description={action === "delete" ? "O acesso é desativado e a conta some das listas. Contratos, logs e cobranças são preservados." : undefined}
          onConfirm={async (reason) => {
            if (!user || !action) return;
            try {
              await userAction({ data: { targetId: user.id, action, reason, role: action === "role_change" ? role : undefined, department: action === "role_change" && role === "admin" ? dept : null } });
              toast.success("Ação registrada na auditoria"); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["sessions", user.id] });
              if (action === "delete") onClose();
            } catch (e) { err(e); }
          }} />
      </SheetContent>
    </Sheet>
  );
}

function Audit() {
  const { data: logs = [] } = useQuery({ queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const { data: names = [] } = useQuery({ queryKey: ["audit-names"], queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [] });
  const n = (id: string | null) => { const p = names.find((x) => x.id === id); return p?.full_name || p?.email || "—"; };
  return (
    <Panel title="Trilha de auditoria (imutável)">
      {logs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
        <ul className="divide-y divide-border text-sm">
          {logs.map((l) => (
            <li key={l.id} className="grid gap-1 py-2 md:grid-cols-[170px_120px_1fr]">
              <span className="font-mono text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR", { second: "2-digit", minute: "2-digit", hour: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
              <Badge variant="outline" className="w-fit">{l.action}</Badge>
              <span>{n(l.actor_id)} → {n(l.target_id)} · <span className="text-muted-foreground">{l.reason}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PinChange() {
  const [f, setF] = useState({ password: "", currentPin: "", newPin: "" });
  const [loading, setLoading] = useState(false);
  return (
    <Panel title="Alterar PIN mestre">
      <form onSubmit={async (e) => {
        e.preventDefault(); setLoading(true);
        try { await changePin({ data: f }); toast.success("PIN mestre alterado"); setF({ password: "", currentPin: "", newPin: "" }); }
        catch (x) { err(x); } finally { setLoading(false); }
      }} className="grid gap-3 md:grid-cols-4">
        <Input type="password" placeholder="Sua senha" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="bg-field" />
        <Input type="password" inputMode="numeric" placeholder="PIN atual" value={f.currentPin} onChange={(e) => setF({ ...f, currentPin: e.target.value.replace(/\D/g, "").slice(0, 8) })} className="bg-field font-mono" />
        <Input type="password" inputMode="numeric" placeholder="Novo PIN" value={f.newPin} onChange={(e) => setF({ ...f, newPin: e.target.value.replace(/\D/g, "").slice(0, 8) })} className="bg-field font-mono" />
        <Button type="submit" disabled={loading}><KeyRound className="h-4 w-4" /> Salvar novo PIN</Button>
      </form>
    </Panel>
  );
}
