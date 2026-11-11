import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerSession } from "@/lib/auth.functions";
import { SESSION_KEY, ALIVE_KEY, REMEMBER_KEY } from "@/lib/session-client";
import { SynexLogo } from "@/components/synex/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { routeAfterLogin } from "./auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Definir nova senha — Synex OS" },
      { name: "description", content: "Defina sua nova senha de acesso ao Synex OS." },
      { property: "og:title", content: "Definir nova senha — Synex OS" },
      { property: "og:description", content: "Defina sua nova senha de acesso ao Synex OS." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { if (session) setReady(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (pw !== pw2) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setLoading(false); return toast.error(error.message); }
    const { session_key } = await registerSession();
    localStorage.setItem(SESSION_KEY, session_key);
    localStorage.setItem(REMEMBER_KEY, "1");
    sessionStorage.setItem(ALIVE_KEY, "1");
    toast.success("Senha atualizada!");
    await routeAfterLogin(navigate);
  }

  return (
    <div className="tech-grid flex min-h-screen flex-col items-center justify-center gap-10 bg-canvas px-6">
      <SynexLogo className="w-64" />
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">Definir nova senha</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Validando o link de acesso... Se nada acontecer, solicite um novo link na tela de login.</p>
        ) : (
          <>
            <div className="space-y-2"><Label>Nova senha</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="bg-field" required /></div>
            <div className="space-y-2"><Label>Confirmação de senha</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="bg-field" required /></div>
            <Button type="submit" disabled={loading} className="w-full bg-brand-gradient">{loading ? "Salvando..." : "Salvar e entrar"}</Button>
          </>
        )}
      </form>
    </div>
  );
}
