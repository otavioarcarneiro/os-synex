
export const checkUptimeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    let query = context.supabase
      .from("projects")
      .select("id")
      .eq("kind", "site");

    if (data.projectId) {
      query = query.eq("id", data.projectId);
    }

    const { data: projects, error } = await query;

    if (error || (data.projectId && !projects?.length)) {
      throw new Error("Projeto indisponível para este acesso.");
    }

    const { syncUptimeFromUptimeRobot } = await import(
      "./uptime-sync.server"
    );

    const result = await syncUptimeFromUptimeRobot(data.projectId);

    // Mantém o retorno em formato de lista, como na função anterior.
    return result.results;
  });
