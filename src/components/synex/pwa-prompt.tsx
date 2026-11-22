import { useEffect, useState } from "react";
import { Bell, BellOff, Download, Share, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type Me } from "@/hooks/use-me";
import { canSeeInstallPrompt } from "@/lib/push-rules";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/push-client";
import { ALIVE_KEY } from "@/lib/session-client";

const DISMISS_KEY = "synex_pwa_dismissed";
type BIP = Event & { prompt: () => Promise<void> };

// Aviso de instalação: 1x por login (fechar vale até sair e entrar de novo).
export function PwaPrompt({ me }: { me: Me }) {
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if (!canSeeInstallPrompt(me.primaryRole)) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || sessionStorage.getItem(DISMISS_KEY) === sessionStorage.getItem(ALIVE_KEY) + me.id) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setOpen(true);
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, [me]);
  if (!open) return null;
  const close = () => { sessionStorage.setItem(DISMISS_KEY, sessionStorage.getItem(ALIVE_KEY) + me.id); setOpen(false); };
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-lg">
      <button onClick={close} aria-label="Fechar" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      <p className="pr-6 font-semibold">Instale o Synex OS</p>
      {ios ? (
        <p className="mt-1 text-sm text-muted-foreground">No Safari, toque em <Share className="inline h-4 w-4" /> Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Acesse como um app, direto da tela inicial.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!ios && deferred && <Button size="sm" onClick={async () => { await deferred.prompt(); close(); }}><Download className="mr-1 h-4 w-4" />Instalar app</Button>}
        <PushToggle me={me} />
      </div>
    </div>
  );
}

export function PushToggle({ me }: { me: Me }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => {}); }, []);
  if (!pushSupported()) return null;
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        if (on) { await disablePush(); setOn(false); toast.success("Notificações desativadas neste aparelho."); }
        else { await enablePush(me.id); setOn(true); toast.success("Notificações ativadas neste aparelho."); }
      } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    }}>
      {on ? <><BellOff className="mr-1 h-4 w-4" />Desativar notificações</> : <><Bell className="mr-1 h-4 w-4" />Ativar notificações</>}
    </Button>
  );
}
