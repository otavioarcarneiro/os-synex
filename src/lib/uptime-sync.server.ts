
import { listMonitors, type UptimeRobotMonitor } from "./uptimerobot.server";
import { sendDownAlert, sendUpAlert } from "./email.server";

type SynexUptimeStatus = "online" | "warning" | "down" | "unknown";

type SyncResult = {
  id: string;
  name: string;
  status: SynexUptimeStatus;
};

function mapMonitorStatus(status: unknown): SynexUptimeStatus | null {
  switch (status) {
    case "UP":
      return "online";
    case "LOOKS_DOWN":
      return "warning";
    case "DOWN":
      return "down";
    case "PAUSED":
    case "STARTED":
      return "unknown";
    default:
      return null;
  }
}

export async function syncUptimeFromUptimeRobot(projectId?: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  let query = supabaseAdmin
    .from("projects")
    .select("id, name, url, uptime_status, external_monitor_id")
    .eq("kind", "site")
    .not("external_monitor_id", "is", null);

  if (projectId) {
    query = query.eq("id", projectId);
  }

  const { data: projects, error: projectsError } = await query;

  if (projectsError) {
    throw new Error("Não foi possível consultar os projetos monitorados.");
  }

  if (!projects?.length) {
    return {
      checked: 0,
      updated: 0,
      skipped: 0,
      results: [] as SyncResult[],
    };
  }

  const page = await listMonitors();

  const monitorsById = new Map<string, UptimeRobotMonitor>(
    page.data.map((monitor) => [String(monitor.id), monitor]),
  );

  const syncedAt = new Date().toISOString();
  const results: SyncResult[] = [];
  let skipped = 0;

  for (const project of projects) {
    const monitorId = project.external_monitor_id;

    if (!monitorId) {
      skipped++;
      continue;
    }

    const monitor = monitorsById.get(monitorId);

    if (!monitor) {
      skipped++;
      continue;
    }

    const status = mapMonitorStatus(monitor.status);

    if (!status) {
      skipped++;
      continue;
    }

    const previousStatus = project.uptime_status as SynexUptimeStatus | null;

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        uptime_status: status,
        uptime_checked_at: syncedAt,
        uptime_latency_ms: null,
        external_synced_at: syncedAt,
      })
      .eq("id", project.id)
      .eq("external_monitor_id", monitorId);

    if (updateError) {
      throw new Error(
        `Não foi possível atualizar o monitoramento do projeto ${project.id}.`,
      );
    }

    // Alerta somente quando ocorre uma transição real de status.
    try {
      if (previousStatus === "online" && status === "down") {
        await sendDownAlert({
          name: project.name,
          url: project.url,
        });
      } else if (previousStatus === "down" && status === "online") {
        await sendUpAlert({
          name: project.name,
          url: project.url,
        });
      }
    } catch (alertError) {
      console.error(
        `Falha ao enviar alerta de uptime do projeto ${project.id}:`,
        alertError,
      );
    }

    results.push({
      id: project.id,
      name: project.name,
      status,
    });
  }

  return {
    checked: projects.length,
    updated: results.length,
    skipped,
    results,
  };
}
