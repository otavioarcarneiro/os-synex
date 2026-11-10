import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, FolderKanban, Wallet, MessagesSquare, NotebookPen, LifeBuoy, Lock, Loader2 } from "lucide-react";
import { useMe, type Me } from "@/hooks/use-me";
import { SynexLogo, SynexMark } from "@/components/synex/brand";
import { UserMenu } from "@/components/synex/user-menu";
import { SessionGuard } from "@/components/synex/session-guard";
import { SecurityAlerts } from "@/components/synex/security-alerts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Synex OS — CRM" }, { name: "description", content: "Centro de comando da Synex Digital Presence." }, { property: "og:title", content: "Synex OS — CRM" }, { property: "og:description", content: "Centro de comando da Synex Digital Presence." }] }),
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; show: (m: Me) => boolean };
const isOwner = (m: Me) => m.primaryRole === "owner";
const isPartner = (m: Me) => m.primaryRole === "partner";
const isExec = (m: Me) => m.primaryRole === "admin" && m.department === "execucao";
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, show: () => true },
  { to: "/app/projetos", label: "Projetos", icon: FolderKanban, show: (m) => isOwner(m) || isPartner(m) || isExec(m) || m.primaryRole === "admin" },
  { to: "/app/financeiro", label: "Financeiro", icon: Wallet, show: (m) => isOwner(m) || isPartner(m) },
  { to: "/app/chat", label: "Comunicação", icon: MessagesSquare, show: () => true },
  { to: "/app/anotacoes", label: "Anotações", icon: NotebookPen, show: (m) => isOwner(m) || isPartner(m) },
  { to: "/app/suporte", label: "Suporte", icon: LifeBuoy, show: isOwner },
  { to: "/app/restrita", label: "Configurações", icon: Lock, show: isOwner },
];

function AppLayout() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!me) return;
    if (me.primaryRole === "client" || !me.primaryRole) navigate({ to: me.primaryRole ? "/portal" : "/auth", replace: true });
  }, [me, navigate]);
  if (isLoading || !me || me.primaryRole === "client") {
    return <div className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  const items = NAV.filter((n) => n.show(me));
  const current = items.slice().reverse().find((n) => path === n.to || path.startsWith(n.to + "/")) ?? items[0];
  return (
    <div className="flex min-h-screen bg-canvas">
      <SessionGuard />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-canvas px-3 py-5 md:flex">
        <div className="px-3 pb-6"><SynexLogo className="w-36" /></div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((n) => {
            const active = n === current;
            return (
              <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                <n.icon className="h-4 w-4" /> {n.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <p className="px-3 text-[11px] text-muted-foreground/60">Synex OS · v1</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-canvas/80 px-4 backdrop-blur md:px-8">
          <SynexMark className="h-7 w-7 md:hidden" />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Synex OS</p>
            <p className="font-display text-sm font-semibold">{current?.label}</p>
          </div>
          <div className="ml-auto"><UserMenu /></div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {items.map((n) => (
            <Link key={n.to} to={n.to} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-xs", n === current ? "bg-primary/15 text-primary" : "text-muted-foreground")}>{n.label}</Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
      {me.primaryRole === "owner" && <SecurityAlerts />}
    </div>
  );
}
