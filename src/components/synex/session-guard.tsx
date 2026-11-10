import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { registerSession, touchSession } from "@/lib/auth.functions";
import { SESSION_KEY, REMEMBER_KEY, ALIVE_KEY, signOutEverywhere } from "@/lib/session-client";

// Garante sessão única (revogação remota) e o "Lembrar de mim".
export function SessionGuard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    let stop = false;
    const out = async (msg: string) => {
      toast.error(msg);
      await signOutEverywhere(qc);
      navigate({ to: "/auth", replace: true });
    };
    (async () => {
      if (localStorage.getItem(REMEMBER_KEY) === "0" && !sessionStorage.getItem(ALIVE_KEY)) {
        return out("Sessão encerrada. Entre novamente.");
      }
      sessionStorage.setItem(ALIVE_KEY, "1");
      if (!localStorage.getItem(SESSION_KEY)) {
        const { session_key } = await registerSession();
        localStorage.setItem(SESSION_KEY, session_key);
      }
    })();
    const check = async () => {
      const key = localStorage.getItem(SESSION_KEY);
      if (!key || stop) return;
      try {
        const r = await touchSession({ data: { key } });
        if (!r.valid) out("Sua sessão foi encerrada (novo acesso em outro dispositivo ou revogação).");
      } catch { /* rede instável: tenta no próximo ciclo */ }
    };
    const t = setInterval(check, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [navigate, qc]);
  return null;
}
