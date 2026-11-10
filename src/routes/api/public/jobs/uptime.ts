import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runUptimeCheck } from "@/lib/admin.functions";

export const Route = createFileRoute("/api/public/jobs/uptime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin.from("system_settings").select("uptime_enabled").eq("id", 1).single();
        if (!s?.uptime_enabled) return Response.json({ skipped: true });
        const results = await runUptimeCheck();
        return Response.json({ checked: results.length });
      },
    },
  },
});
