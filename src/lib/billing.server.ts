import { FROM_FINANCEIRO, reminderHtml, sendEmail, thanksHtml } from "./email.server";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const SELECT = "id,amount,due_date,status,reminder_sent_at,due_notice_sent_at,thanks_sent_at,project:projects(name,client:profiles!projects_client_id_fkey(email,full_name))";

async function admin(): Promise<any> { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
function info(row: any) {
  const client = row.project?.client;
  return { to: client?.email as string | undefined, inv: { amount: Number(row.amount), due_date: row.due_date, project: row.project?.name ?? "Projeto", name: client?.full_name || "cliente" } };
}

// Lembrete 3 dias antes e aviso no dia do vencimento; colunas *_sent_at evitam duplicidade.
export async function runBillingReminders() {
  const db = await admin();
  const today = ymd(new Date());
  const in3 = ymd(new Date(Date.now() + 3 * 86400000));
  let sent = 0;
  for (const [date, col, isToday] of [[in3, "reminder_sent_at", false], [today, "due_notice_sent_at", true]] as const) {
    const { data, error } = await db.from("invoices").select(SELECT).eq("status", "pending").eq("due_date", date).is(col, null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const { to, inv } = info(row);
      if (!to) continue;
      const { data: claimed } = await db.from("invoices").update({ [col]: new Date().toISOString() }).eq("id", row.id).is(col, null).select("id");
      if (!claimed?.length) continue;
      try { await sendEmail(FROM_FINANCEIRO, to, isToday ? "Sua fatura Synex vence hoje" : "Lembrete: fatura Synex vence em 3 dias", reminderHtml(inv, isToday)); sent++; }
      catch (e) { await db.from("invoices").update({ [col]: null }).eq("id", row.id); console.error(e); }
    }
  }
  return sent;
}

export async function sendPaymentThanks(invoiceId: string) {
  const db = await admin();
  const { data: row } = await db.from("invoices").select(SELECT).eq("id", invoiceId).maybeSingle();
  if (!row || row.status !== "paid" || row.thanks_sent_at) return false;
  const { to, inv } = info(row);
  if (!to) return false;
  const { data: claimed } = await db.from("invoices").update({ thanks_sent_at: new Date().toISOString() }).eq("id", invoiceId).is("thanks_sent_at", null).select("id");
  if (!claimed?.length) return false;
  try { await sendEmail(FROM_FINANCEIRO, to, "Pagamento confirmado — obrigado!", thanksHtml(inv)); return true; }
  catch (e) { await db.from("invoices").update({ thanks_sent_at: null }).eq("id", invoiceId); throw e; }
}
