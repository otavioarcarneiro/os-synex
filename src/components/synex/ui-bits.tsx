import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">{label}{icon}</div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const UPTIME = {
  online: { cls: "bg-success", label: "Online" },
  warning: { cls: "bg-warning", label: "Atenção" },
  down: { cls: "bg-danger", label: "Queda / Fora do ar" },
  unknown: { cls: "bg-muted-foreground", label: "Sem leitura" },
} as const;
export function UptimeLight({ status, withLabel = true }: { status: string; withLabel?: boolean }) {
  const u = UPTIME[(status as keyof typeof UPTIME)] ?? UPTIME.unknown;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", status === "down" && "font-semibold text-danger")}>
      <span className={cn("h-2.5 w-2.5 rounded-full", u.cls, status === "online" && "shadow-[0_0_8px_var(--success)]", status === "down" && "animate-pulse shadow-[0_0_10px_var(--danger)]")} />
      {withLabel && u.label}
    </span>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {title && <div className="flex items-center justify-between border-b border-border px-5 py-3"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export const PIX_KEY = "synex.presence@gmail.com";
