import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertOwner(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (!data) throw new Error("Acesso restrito ao proprietário");
}

// Envia um único e-mail com a soma dos projetos escolhidos pelo proprietário.
export const sendSelectedClientInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    clientId: z.string().uuid(),
    projectIds: z.array(z.string().uuid()).min(1).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { sendSelectedClientInvoicesManually } = await import("./billing.server");
    return sendSelectedClientInvoicesManually(data.clientId, data.projectIds);
  });
