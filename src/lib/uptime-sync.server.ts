
import { listMonitors, type UptimeRobotMonitor } from "./uptimerobot.server";

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

export async function syncUptimeFromUptimeRobot() {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  // Consulta somente projetos associados a monitores externos.
  const { data: projects, error: projectsError } = await supabaseAdmin
    .from("projects")
    .select("id, name, external_monitor_id")
    .eq("kind", "site")
    .not("external_monitor_id", "is", null);

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

  // Uma única chamada à API lista todos os monitores.
  const page = await listMonitors();

  const monitorsById = new Map<string, UptimeRobotMonitor>(
    page.data.map((monitor) => [String(monitor.id), monitor]),
  );

  const syncedAt = new Date().toISOString();
  const results: SyncResult[] = [];
  let skipped = 0;

  // Processamento sequencial para manter as operações controladas.
  for (const project of projects) {
    const monitorId = project.external_monitor_id;

    if (!monitorId) {
      skipped++;
      continue;
    }

    const monitor = monitorsById.get(monitorId);

    // Monitor ausente na API: não altera o status existente.
    if (!monitor) {
      skipped++;
      continue;
    }

    const status = mapMonitorStatus(monitor.status);

    // Status desconhecido: não sobrescreve dados válidos.
    if (!status) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        uptime_status: status,
        external_synced_at: syncedAt,
      })
      .eq("id", project.id)
      .eq("external_monitor_id", monitorId);

    if (updateError) {
      throw new Error(
        `Não foi possível atualizar o monitoramento do projeto ${project.id}.`,
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
