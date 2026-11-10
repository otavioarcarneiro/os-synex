import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `Você é a assistente virtual da Synex Digital Presence, agência de sites e gestão de Instagram.
Responda em português, de forma cordial e objetiva, sobre os projetos do cliente, prazos, mensalidade e uso do portal.
Pagamentos são via PIX na chave synex.presence@gmail.com. Não invente dados que você não tem.
Se o cliente pedir para falar com uma pessoa, estiver insatisfeito ou o assunto exigir decisão comercial/técnica, responda exatamente começando com [HUMANO] e uma breve mensagem dizendo que o Otávio vai assumir o atendimento.`;

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid(), body: z.string().trim().min(1).max(2000), human: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ticket } = await context.supabase.from("support_tickets").select("*").eq("id", data.ticketId).eq("client_id", context.userId).single();
    if (!ticket) throw new Error("Atendimento não encontrado");
    await context.supabase.from("support_messages").insert({ ticket_id: ticket.id, role: "user", body: data.body });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.human) {
      await supabaseAdmin.from("support_tickets").update({ status: "human" }).eq("id", ticket.id);
      await supabaseAdmin.from("support_messages").insert({ ticket_id: ticket.id, role: "assistant", body: "Certo! Transferi seu atendimento para o Otávio. Ele responderá por aqui em breve." });
      return { ok: true };
    }
    if (ticket.status !== "ai") return { ok: true };
    const { data: history } = await supabaseAdmin.from("support_messages").select("role, body").eq("ticket_id", ticket.id).order("created_at").limit(30);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM }, ...(history ?? []).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.body }))],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`AI gateway [${res.status}]: ${t}`);
      await supabaseAdmin.from("support_messages").insert({ ticket_id: ticket.id, role: "assistant", body: "Não consegui responder agora. Clique em \"Falar com o Otávio\" para atendimento humano." });
      return { ok: false };
    }
    const json = await res.json();
    let reply: string = json.choices?.[0]?.message?.content ?? "";
    if (reply.startsWith("[HUMANO]")) {
      reply = reply.replace("[HUMANO]", "").trim();
      await supabaseAdmin.from("support_tickets").update({ status: "human" }).eq("id", ticket.id);
    }
    await supabaseAdmin.from("support_messages").insert({ ticket_id: ticket.id, role: "assistant", body: reply || "Certo!" });
    return { ok: true };
  });
