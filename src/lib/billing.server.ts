import { FROM_FINANCEIRO, brl, clientInvoicesHtml, dateBR, invoiceHtml, reminderHtml, sendEmail, thanksHtml } from "./email.server";
import { monthlyFee } from "./pricing";

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
  { const { pushToOwners } = await import("./push.server"); await pushToOwners("invoice_paid", { title: "Fatura paga", body: `${inv.project} — ${inv.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, url: "/app/financeiro" }); }
  try { await sendEmail(FROM_FINANCEIRO, to, "Pagamento confirmado — obrigado!", thanksHtml(inv)); return true; }
  catch (e) { await db.from("invoices").update({ thanks_sent_at: null }).eq("id", invoiceId); throw e; }
}

// Envio manual selecionado: usa todos os projetos escolhidos, independentemente da recorrência.
// Não cria, consulta nem altera registros na tabela invoices.
export async function sendSelectedClientInvoicesManually(clientId: string, projectIds: string[]) {
  const db = await admin();
  const { data: prof, error: profileError } = await db
    .from("profiles")
    .select("full_name,email")
    .eq("id", clientId)
    .maybeSingle();

  if (profileError || !prof) throw new Error("Cliente não encontrado.");
  if (!prof.email) throw new Error("O cliente não tem e-mail cadastrado.");
  if (!projectIds.length) throw new Error("Selecione pelo menos um projeto.");

  const uniqueIds = [...new Set(projectIds)];
  const { data: projects, error: projectsError } = await db
    .from("projects")
    .select("id,name,contract_start")
    .eq("client_id", clientId)
    .in("id", uniqueIds)
    .order("name", { ascending: true });

  if (projectsError) throw new Error("Não foi possível carregar os projetos selecionados.");
  if (!projects?.length || projects.length !== uniqueIds.length) throw new Error("Um ou mais projetos selecionados não pertencem a este cliente.");

  const now = new Date();
  const today = ymd(now);
  const items = projects.map((project: { name: string; contract_start: string }) => {
    const contractDay = new Date(project.contract_start + "T12:00:00").getDate();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(28, contractDay)).toISOString().slice(0, 10);
    return {
      project: project.name || "Projeto",
      due_date: dueDate,
      amount: monthlyFee(project.contract_start, now),
      overdue: dueDate < today,
    };
  });

  const total = items.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);
  const subject = items.length === 1
    ? `Cobrança Synex — ${items[0].project} — ${dateBR(items[0].due_date)}`
    : `Cobrança Synex — ${items.length} projetos — total ${brl(total)}`;

  await sendEmail(FROM_FINANCEIRO, prof.email, subject, clientInvoicesHtml(prof.full_name || "cliente", items));
  return { count: items.length, total };
}

// Cobrança manual imediata de uma fatura já registrada.
// Mantida para o botão individual do histórico; não altera os registros.
export async function sendInvoiceManually(invoiceId: string) {
  const db = await admin();
  const { data: row, error } = await db.from("invoices").select(SELECT).eq("id", invoiceId).maybeSingle();
  if (error || !row) throw new Error("Fatura não encontrada.");
  if (row.status !== "pending") throw new Error("Só é possível enviar faturas pendentes.");
  const { to, inv } = info(row);
  if (!to) throw new Error("O cliente deste projeto não tem e-mail cadastrado.");
  const overdue = row.due_date < ymd(new Date());
  const subject = overdue ? `Fatura Synex em atraso — vencimento ${dateBR(row.due_date)}` : `Fatura Synex — vencimento ${dateBR(row.due_date)}`;
  await sendEmail(FROM_FINANCEIRO, to, subject, invoiceHtml(inv, overdue));
  return true;
}
