import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { matchesSiteOrigin } from "@/lib/access-rules";

const bodySchema = z.object({ siteId: z.string().uuid(), eventId: z.string().uuid(), kind: z.enum(["visit", "conversion"]) }).strict();
export const Route = createFileRoute("/api/public/analytics/collect")({ server: { handlers: {
  OPTIONS: ({ request }) => new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": request.headers.get("origin") ?? "null", "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin",
  } }),
  POST: async ({ request }) => {
    if (Number(request.headers.get("content-length") ?? 0) > 512) return new Response(null, { status: 413 });
    const text = await request.text();
    if (text.length > 512) return new Response(null, { status: 413 });
    let input;
    try { input = bodySchema.parse(JSON.parse(text)); } catch { return new Response(null, { status: 400 }); }
    const origin = request.headers.get("origin");
    // A public tag cannot keep secrets. Verify its registered website origin;
    // collection is rate-limited and deduplicated in the database, not financial proof.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects").select("url, kind, is_ecommerce").eq("id", input.siteId).maybeSingle();
    if (!project || project.kind !== "site" || !matchesSiteOrigin(project.url, origin)) return new Response(null, { status: 403 });
    if (input.kind === "conversion" && !project.is_ecommerce) return new Response(null, { status: 400 });
    const { error } = await supabaseAdmin.rpc("ingest_site_event", { _project: input.siteId, _event: input.eventId, _kind: input.kind });
    return new Response(null, { status: error ? 429 : 204, headers: { "Access-Control-Allow-Origin": origin ?? "null", "Vary": "Origin" } });
  },
} } });