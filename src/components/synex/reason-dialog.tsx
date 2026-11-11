import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel = "Confirmar", reasonLabel = "Motivo (obrigatório, registrado na auditoria)", destructive, onConfirm, children }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; confirmLabel?: string;
  destructive?: boolean; onConfirm: (reason: string) => Promise<void>; children?: ReactNode; reasonLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-navy-border bg-navy">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-2">
          <label className="text-sm font-medium">{reasonLabel}</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo desta ação..." className="bg-field" maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={reason.trim().length < 5 || loading}
            onClick={async () => { setLoading(true); try { await onConfirm(reason.trim()); onOpenChange(false); } finally { setLoading(false); } }}>
            {loading ? "Processando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
