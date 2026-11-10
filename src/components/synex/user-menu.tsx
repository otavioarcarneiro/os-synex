import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, KeyRound, LogOut, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, permissionsFor, ROLE_LABEL, DEPT_LABEL, type Me } from "@/hooks/use-me";
import { signOutEverywhere } from "@/lib/session-client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function UserAvatar({ me, className }: { me: Pick<Me, "avatar_url" | "full_name"> | null | undefined; className?: string }) {
  return (
    <Avatar className={className}>
      {me?.avatar_url && <AvatarImage src={me.avatar_url} alt={me.full_name} />}
      <AvatarFallback className="bg-secondary"><User className="h-1/2 w-1/2 text-muted-foreground" /></AvatarFallback>
    </Avatar>
  );
}

async function resizeToDataUrl(file: File, size = 256): Promise<string> {
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const s = Math.min(img.width, img.height);
  c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.85);
}

export function UserMenu() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-full ring-2 ring-transparent transition hover:ring-primary" aria-label="Abrir perfil">
        <UserAvatar me={me} className="h-9 w-9" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto border-border bg-card sm:max-w-md">
          <SheetHeader><SheetTitle>Meu perfil</SheetTitle></SheetHeader>
          {me && <ProfileBody me={me} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ProfileBody({ me }: { me: Me }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.full_name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    const { error } = await supabase.from("profiles").update(patch as never).eq("id", me.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="space-y-6 px-4 pb-8">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="relative">
          <UserAvatar me={me} className="h-24 w-24" />
          <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground" aria-label="Trocar foto">
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) return toast.error("Imagem muito grande (máx. 8MB)");
            await save({ avatar_url: await resizeToDataUrl(f) });
          }} />
        </div>
        <div className="text-center">
          <p className="font-semibold">{me.full_name || me.email}</p>
          <div className="mt-1 flex justify-center gap-1">
            {me.primaryRole && <Badge variant="outline" className="border-primary text-primary">{ROLE_LABEL[me.primaryRole]}</Badge>}
            {me.department && <Badge variant="outline">{DEPT_LABEL[me.department]}</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1"><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-field" maxLength={120} /></div>
        <div className="space-y-1"><Label>E-mail</Label><Input value={me.email} disabled className="bg-field" /></div>
        <div className="space-y-1"><Label>Telefone / WhatsApp</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 9 0000-0000" className="bg-field" maxLength={30} /></div>
        <Button disabled={saving} onClick={() => save({ full_name: name.trim(), phone: phone.trim() || null })} className="w-full">Salvar dados</Button>
      </div>

      <div className="rounded-xl border border-border bg-background/50 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Permissões ativas</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {permissionsFor(me).map((p) => <li key={p}>• {p}</li>)}
        </ul>
      </div>

      <Button variant="secondary" className="w-full" onClick={() => setPwOpen(true)}><KeyRound className="h-4 w-4" /> Alterar senha</Button>
      <Button variant="destructive" className="w-full" onClick={async () => { await signOutEverywhere(qc); navigate({ to: "/auth", replace: true }); }}>
        <LogOut className="h-4 w-4" /> Encerrar sessão
      </Button>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} email={me.email} />
    </div>
  );
}

function ChangePasswordDialog({ open, onOpenChange, email }: { open: boolean; onOpenChange: (v: boolean) => void; email: string }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("A nova senha deve ter pelo menos 8 caracteres.");
    if (pw !== pw2) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authErr) { setLoading(false); return toast.error("Senha atual incorreta."); }
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: current } as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso");
    setCurrent(""); setPw(""); setPw2("");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-navy-border bg-navy">
        <DialogHeader>
          <DialogTitle>Confirmação de segurança</DialogTitle>
          <DialogDescription>Revalide sua senha atual antes de cadastrar a nova.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label>Senha atual</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="bg-field" /></div>
          <div className="space-y-1"><Label>Nova senha</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required className="bg-field" /></div>
          <div className="space-y-1"><Label>Confirmar nova senha</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required className="bg-field" /></div>
          <Button type="submit" disabled={loading} className="w-full bg-brand-gradient">{loading ? "Validando..." : "Alterar senha"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
