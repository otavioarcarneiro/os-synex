import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "partner" | "admin" | "client";
export type Me = {
  id: string; email: string; full_name: string; phone: string | null; avatar_url: string | null;
  department: "juridico" | "execucao" | null; status: string; roles: Role[]; primaryRole: Role | null;
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Proprietário", partner: "Sócio", admin: "Administrador", client: "Cliente" };
export const DEPT_LABEL = { juridico: "Jurídico", execucao: "Execução" } as const;

export function permissionsFor(me: Me): string[] {
  switch (me.primaryRole) {
    case "owner": return ["Acesso irrestrito", "Área Restrita", "Faturamento e cobrança", "Auditoria de todos os canais e DMs", "Gestão de usuários e sessões"];
    case "partner": return ["Dashboard executivo", "Faturamento acumulado", "Projetos e status financeiro", "Canais Geral e Parceiros", "Anotações"];
    case "admin": return me.department === "juridico"
      ? ["Contratos e documentos", "Canal Jurídico", "Canal Geral", "DMs permitidas"]
      : ["Projetos e sites", "Monitor de uptime", "Canal Execução", "Canal Geral", "DMs técnicas"];
    case "client": return ["Portal do Cliente", "Seus projetos", "Documentos e faturas", "Suporte"];
    default: return [];
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role as Role);
      const primaryRole = (["owner", "partner", "admin", "client"] as Role[]).find((x) => r.includes(x)) ?? null;
      return {
        id: user.id, email: user.email ?? "", full_name: profile?.full_name ?? "", phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null, department: profile?.department ?? null, status: profile?.status ?? "active",
        roles: r, primaryRole,
      };
    },
    staleTime: 30_000,
  });
}
