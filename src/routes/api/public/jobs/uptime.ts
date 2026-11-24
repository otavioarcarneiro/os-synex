
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/uptime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: settings } = await supabaseAdmin
          .from("system_settings")
          .select("uptime_enabled")
          .eq("id", 1)
          .single();

        if (!settings?.uptime_enabled) {
          return Response.json({ skipped: true });
        }

        const { UptimeRobotError } = await import(
          "@/lib/uptimerobot.server"
        );

        const { syncUptimeFromUptimeRobot } = await import(
          "@/lib/uptime-sync.server"
        );

        try {
          const result = await syncUptimeFromUptimeRobot();

          return Response.json({
            checked: result.checked,
            updated: result.updated,
            skipped: result.skipped,
            results: result.results,
          });
        } catch (error) {
          const code =
            error instanceof UptimeRobotError ? error.code : "unknown";

          console.error("[uptimerobot] sincronização automática falhou:", code);

          return Response.json(
            {
              error: "Não foi possível sincronizar os monitores do UptimeRobot.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
