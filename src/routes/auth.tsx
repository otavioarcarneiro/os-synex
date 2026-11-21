import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { secureLogin, requestPasswordReset, type LoginResult } from "@/lib/auth.functions";
import { SESSION_KEY, REMEMBER_KEY, ALIVE_KEY } from "@/lib/session-client";
import { SynexLogo } from "@/components/synex/brand";
import { WhatsAppFab } from "@/components/synex/whatsapp-fab";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registerSession } from "@/lib/auth.functions";
import { isAuthorizedProfile } from "@/lib/access-rules";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Synex OS" },
      { name: "description", content: "Acesso ao CRM e Portal de Clientes da Synex Digital Presence." },
      { property: "og:title", content: "Entrar — Synex OS" },
      { property: "og:description", content: "Acesso ao CRM e Portal de Clientes da Synex Digital Presence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function routeAfterLogin(navigate: ReturnType<typeof useNavigate>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const r = (roles ?? []).map((x) => x.role);
  const { data: profile } = await supabase.from("profiles").select("status,email").eq("id", user.id).maybeSingle();
  if (!isAuthorizedProfile(profile?.status, r.length) || profile?.email.toLowerCase() !== user.email?.toLowerCase()) {
    await supabase.auth.signOut();
    toast.error("Acesso não autorizado pela Synex. Seu e-mail deve estar previamente cadastrado no CRM.");
    return;
  }
  if (!localStorage.getItem(SESSION_KEY)) {
    try { const session = await registerSession(); localStorage.setItem(SESSION_KEY, session.session_key); sessionStorage.setItem(ALIVE_KEY,"1"); }
    catch (error) { await supabase.auth.signOut(); toast.error(error instanceof Error ? error.message : "Acesso não autorizado pela Synex."); return; }
  }
  navigate({ to: r.includes("client") && r.length === 1 ? "/portal" : "/app", replace: true });
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<LoginResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [otp, setOtp] = useState("");
  const [info, setInfo] = useState<{ resendAt: string; codesLeft: number; limitReached: boolean; expiresAt: string | null } | null>(null);
  const [helpSent, setHelpSent] = useState(false);
  const countdown = useCountdown(cooldownUntil);
  const resendCountdown = useCountdown(info?.resendAt ?? null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) routeAfterLogin(navigate); });
  }, [navigate]);

  const locked = state?.status === "admin_locked";
  const disabled = loading || locked || !!countdown;

  async function run(extra: { otp?: string; action?: "login" | "resend" | "no_email" } = {}) {
    setLoading(true);
    try {
      const res = await secureLogin({ data: { email, password, ...extra } });
      setState(res);
      if (res.status === "ok") {
        await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
        localStorage.setItem(SESSION_KEY, res.session_key);
        localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
        sessionStorage.setItem(ALIVE_KEY, "1");
        await routeAfterLogin(navigate);
      } else if (res.status === "otp_required" || res.status === "otp_invalid") {
        setStep("otp");
        setInfo({ resendAt: res.resendAt, codesLeft: res.codesLeft, limitReached: res.limitReached, expiresAt: res.expiresAt });
        if (res.status === "otp_invalid" || (res.status === "otp_required" && res.sent)) setOtp("");
        if (res.status === "otp_required" && res.sent) toast.success("Código enviado para o seu e-mail");
      } else if (res.status === "otp_cooldown") {
        setStep("otp");
        setCooldownUntil(res.until);
      } else if (res.status === "help_sent") {
        setStep("otp");
        setHelpSent(true);
      } else if (res.status === "cooldown") {
        setStep("credentials");
        setCooldownUntil(res.until);
      } else if (res.status === "blocked") {
        toast.error(res.message);
      } else {
        setStep("credentials");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "otp") void run({ otp });
    else void run({ action: "login" });
  }

  function backToCredentials() {
    setStep("credentials"); setState(null); setOtp(""); setInfo(null); setHelpSent(false); setCooldownUntil(null);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Painel de marca meio a meio */}
      <div className="tech-grid absolute inset-x-0 top-0 h-56 bg-canvas md:inset-y-0 md:h-auto md:right-1/2" />
      <div className="pointer-events-none absolute left-[8%] top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-primary/15 blur-[120px] md:block" />
      <div className="relative z-10 grid min-h-screen md:grid-cols-[1fr_1fr]">
        <div className="flex h-56 items-center justify-center px-8 md:h-auto md:justify-start md:pl-[6%]">
          <SynexLogo className="w-64 drop-shadow-[0_0_30px_color-mix(in_oklab,var(--primary)_35%,transparent)] md:w-[min(34vw,560px)]" />
        </div>
        <div className="flex items-center justify-center px-6 pb-16 md:justify-end md:pr-[8%]">
          <form onSubmit={onSubmit} className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card/60 p-8 backdrop-blur md:bg-transparent md:border-0 md:p-0">
            <div className="text-center md:mb-8">
              <h1 className="text-2xl font-semibold">Login</h1>
              <p className="mt-1 text-sm text-muted-foreground">Synex OS · CRM e Portal de Clientes</p>
            </div>
            {step === "credentials" && (
              <>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-transparent bg-field focus-visible:border-primary" disabled={locked} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">Senha</Label>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} className="h-11 border-transparent bg-field pr-11 focus-visible:border-primary" disabled={locked} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

              </>
            )}
            {step === "otp" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-muted-foreground">Código de verificação</Label>
                  <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000"
                    className="h-12 border-transparent bg-field text-center font-mono text-2xl tracking-[0.5em] focus-visible:border-primary" />
                  <p className="text-center text-xs text-muted-foreground">Enviamos um código de 6 dígitos para o seu e-mail. Ele expira em 10 minutos.</p>
                </div>
                {state?.status === "otp_invalid" && state.reason === "wrong" && !countdown && (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                    Código incorreto.{state.warning ? " Atenção: mais um erro bloqueará novas tentativas por 2 minutos, e os próximos bloqueios serão maiores." : ""}
                  </p>
                )}
                {state?.status === "otp_invalid" && state.reason === "expired" && (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Código expirado ou indisponível. Peça um novo código.</p>
                )}
                {info?.limitReached && (
                  <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Limite de 3 códigos atingido. Use o último código enviado, tente de novo mais tarde ou peça ajuda ao SAC.</p>
                )}
                {helpSent && (
                  <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Pedido enviado ao SAC. O Proprietário foi avisado e vai analisar a liberação do seu acesso.</p>
                )}
                <div className="flex flex-col items-center gap-2 text-sm">
                  <button type="button" disabled={loading || !!resendCountdown || !!info?.limitReached || !!countdown} onClick={() => run({ action: "resend" })}
                    className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                    {resendCountdown ? `Reenviar código em ${resendCountdown}` : "Reenviar código"}
                  </button>
                  {info && !info.limitReached && <span className="text-xs text-muted-foreground">{info.codesLeft > 1 ? `Você ainda pode pedir ${info.codesLeft - 1} reenvio(s).` : "Este foi o último código disponível."}</span>}
                  <button type="button" disabled={loading || helpSent} onClick={() => run({ action: "no_email" })}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50">
                    Não tenho acesso ao e-mail
                  </button>
                  <button type="button" onClick={backToCredentials} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Voltar</button>
                </div>
              </div>
            )}
            {state?.status === "invalid" && !countdown && (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                Credenciais inválidas. {state.attemptsLeft > 0 ? `${state.attemptsLeft} tentativa(s) antes do bloqueio temporário.` : ""}
              </p>
            )}
            {countdown && (
              <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <Clock className="h-4 w-4" /> Muitas tentativas. Tente novamente em <span className="font-mono">{countdown}</span>
              </p>
            )}
            {locked && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
                <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Bloqueio administrativo</p>
                <p className="mt-1 text-danger/90">Esta conta ou origem de acesso foi bloqueada por segurança. A liberação é feita pela Synex após contato pelo WhatsApp.</p>
              </div>
            )}

            {step === "credentials" && (
              <label className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} /> Lembrar de mim
              </label>
            )}
            <div className="flex justify-center">
              <Button type="submit" disabled={disabled || (step === "otp" && otp.length !== 6)} className="h-11 min-w-40 rounded-full bg-brand-gradient px-8 text-base font-semibold shadow-glow transition-all hover:brightness-110 active:scale-[0.98]">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : step === "otp" ? "Verificar código" : "Entrar"}
              </Button>
            </div>
            {step === "credentials" && <div className="text-center">
              <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Esqueceu sua senha?
              </button>
            </div>}
            <p className="pt-6 text-center text-xs text-muted-foreground/70">
              Acesso restrito a usuários cadastrados pela Synex Digital Presence. Todas as operações são registradas.
            </p>
          </form>
        </div>
      </div>
      <ForgotDialog open={forgotOpen} onOpenChange={setForgotOpen} initialEmail={email} />
      <WhatsAppFab />
    </div>
  );
}

function ForgotDialog({ open, onOpenChange, initialEmail }: { open: boolean; onOpenChange: (v: boolean) => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setEmail(initialEmail); setSent(false); } }, [open, initialEmail]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await requestPasswordReset({ data: { email, origin: window.location.origin } });
      if (!r.ok) toast.error(r.message); else setSent(true);
    } catch { toast.error("Não foi possível enviar agora."); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>Enviaremos um link seguro e temporário para o e-mail cadastrado.</DialogDescription>
        </DialogHeader>
        {sent ? (
          <p className="rounded-md bg-success/10 p-3 text-sm text-success">Se o e-mail estiver cadastrado, você receberá o link em instantes. Verifique também o spam.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-field" />
            <Button type="submit" disabled={loading} className="w-full bg-brand-gradient">{loading ? "Enviando..." : "Enviar link"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
