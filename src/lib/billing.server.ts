
import {
  FROM_FINANCEIRO,
  brl,
  clientInvoicesHtml,
  dateBR,
  invoiceHtml,
  reminderHtml,
  sendEmail,
  thanksHtml,
} from "./email.server";
import { planManualInvoices } from "./manual-invoice";

const ymd = (d: Date) =>
  d.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });

const SELECT =
  "id,amount,due_date,status,reminder_sent_at,due_notice_sent_at,thanks_sent_at,project:projects(name,client:profiles!projects_client_id_fkey(email,full_name))";

async function admin(): Promise<any> {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin;
}

function info(row: any) {
  const client = row.project?.client;

  return {
    to: client?.email as string | undefined,
    inv: {
      amount: Number(row.amount),
      due_date: row.due_date,
      project: row.project?.name ?? "Projeto",
      name: client?.full_name || "cliente",
    },
  };
}

// Lembretes de vencimento e avisos no dia do vencimento.
export async function runBillingReminders() {
  const db = await admin();
  const today = ymd(new Date());
  const in3 = ymd(new Date(Date.now() + 3 * 86400000));

  let sent = 0;

  for (const [date, col, isToday] of [
    [in3, "reminder_sent_at", false],
    [today, "due_notice_sent_at", true],
  ] as const) {
    const { data, error } = await db
      .from("invoices")
      .select(SELECT)
      .eq("status", "pending")
      .eq("due_date", date)
      .is(col, null);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const { to, inv } = info(row);
      if (!to) continue;

      const { data: claimed } = await db
        .from("invoices")
        .update({ [col]: new Date().toISOString() })
        .eq("id", row.id)
        .is(col, null)
        .select("id");

      if (!claimed?.length) continue;

      try {
        await sendEmail(
          FROM_FINANCEIRO,
          to,
          isToday
            ? "Sua fatura Synex vence hoje"
            : "Lembrete: fatura Synex vence em 3 dias",
          reminderHtml(inv, isToday),
        );

        sent++;
      } catch (e) {
        await db
          .from("invoices")
          .update({ [col]: null })
          .eq("id", row.id);

        console.error(e);
      }
    }
  }

  return sent;
}

// E-mail automático de agradecimento após pagamento.
export async function sendPaymentThanks(invoiceId: string) {
  const db = await admin();

  const { data: row } = await db
    .from("invoices")
    .select(SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!row || row.status !== "paid" || row.thanks_sent_at) {
    return false;
  }

  const { to, inv } = info(row);
  if (!to) return false;

  const { data: claimed } = await db
    .from("invoices")
    .update({ thanks_sent_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .is("thanks_sent_at", null)
    .select("id");

  if (!claimed?.length) return false;

  {
    const { pushToOwners } = await import("./push.server");

    await pushToOwners("invoice_paid", {
      title: "Fatura paga",
      body: `${inv.project} — ${inv.amount.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}`,
      url: "/app/financeiro",
    });
  }

  try {
    await sendEmail(
      FROM_FINANCEIRO,
      to,
      "Pagamento confirmado — obrigado!",
      thanksHtml(inv),
    );

    return true;
  } catch (e) {
    await db
      .from("invoices")
      .update({ thanks_sent_at: null })
      .eq("id", invoiceId);

    throw e;
  }
}

// "Enviar fatura": REGISTRA a fatura do mês como em aberto (1 por projeto/mês, sem duplicar) e envia o e-mail ao cliente.
// A fatura registrada entra nos totais em aberto, aparece no histórico do cliente e pode ser baixada ("Marcar pago"),
// o que dispara o agradecimento e soma no total recebido. Não altera reminder_sent_at / due_notice_sent_at / thanks_sent_at.
async function registerAndSendInvoices(clientId: string, projectIds: string[] | "billing") {
  const db = await admin();
  const { data: prof, error: profileError } = await db.from("profiles").select("full_name,email").eq("id", clientId).maybeSingle();
  if (profileError || !prof) throw new Error("Cliente não encontrado.");
  if (!prof.email) throw new Error("O cliente não tem e-mail cadastrado.");

  let uniqueIds: string[] = [];
  let query = db.from("projects").select("id,name,contract_start").eq("client_id", clientId).order("name", { ascending: true });
  if (projectIds === "billing") query = query.eq("billing_enabled", true);
  else {
    if (!projectIds.length) throw new Error("Selecione pelo menos um projeto.");
    uniqueIds = [...new Set(projectIds)];
    query = query.in("id", uniqueIds);
  }
  const { data: projects, error: projectsError } = await query;
  if (projectsError) throw new Error("Não foi possível carregar os projetos do cliente.");
  if (!projects?.length) throw new Error(projectIds === "billing" ? "Este cliente não tem projetos com cobrança recorrente ativa." : "Um ou mais projetos selecionados não pertencem a este cliente.");
  if (projectIds !== "billing" && projects.length !== uniqueIds.length) throw new Error("Um ou mais projetos selecionados não pertencem a este cliente.");

  const { data: existing, error: invoicesError } = await db.from("invoices").select("project_id,status,due_date,amount").in("project_id", projects.map((p: { id: string }) => p.id));
  if (invoicesError) throw new Error("Não foi possível verificar as faturas já registradas.");

  const now = new Date();
  const plan = planManualInvoices(projects, existing ?? [], now, ymd(now));
  if (!plan.items.length) throw new Error("A fatura deste mês já está paga para os projetos selecionados.");

  if (plan.toCreate.length) {
    const { error } = await db.from("invoices").insert(plan.toCreate);
    if (error) throw new Error("Não foi possível registrar a fatura em aberto.");
  }

  const first = plan.items[0];
  const subject = plan.items.length === 1 && first
    ? `Cobrança Synex — ${first.project} — ${dateBR(first.due_date)}`
    : `Cobrança Synex — ${plan.items.length} projetos — total ${brl(plan.total)}`;
  try {
    await sendEmail(FROM_FINANCEIRO, prof.email, subject, clientInvoicesHtml(prof.full_name || "cliente", plan.items));
  } catch (e) {
    console.error(e);
    // Reenviar é seguro: a fatura já registrada é reaproveitada, nunca duplicada.
    throw new Error(plan.toCreate.length ? "A fatura foi registrada em aberto, mas o e-mail não foi enviado. Clique em Enviar fatura de novo (não duplica)." : "Não foi possível enviar o e-mail da fatura.");
  }
  return { count: plan.items.length, total: plan.total, created: plan.toCreate.length, skipped: plan.skipped };
}

// Projetos com cobrança recorrente ligada (mantida para admin.functions.ts).
export const sendClientInvoicesManually = (clientId: string) => registerAndSendInvoices(clientId, "billing");
// Projetos escolhidos pelo proprietário na tela do Financeiro.
export const sendSelectedClientInvoicesManually = (clientId: string, projectIds: string[]) => registerAndSendInvoices(clientId, projectIds);

// Envio manual de uma fatura individual já registrada.
export async function sendInvoiceManually(invoiceId: string) {
  const db = await admin();

  const { data: row, error } = await db
    .from("invoices")
    .select(SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !row) {
    throw new Error("Fatura não encontrada.");
  }

  if (row.status !== "pending") {
    throw new Error("Só é possível enviar faturas pendentes.");
  }

  const { to, inv } = info(row);

  if (!to) {
    throw new Error("O cliente deste projeto não tem e-mail cadastrado.");
  }

  const overdue = row.due_date < ymd(new Date());

  const subject = overdue
    ? `Fatura Synex em atraso — vencimento ${dateBR(row.due_date)}`
    : `Fatura Synex — vencimento ${dateBR(row.due_date)}`;

  await sendEmail(
    FROM_FINANCEIRO,
    to,
    subject,
    invoiceHtml(inv, overdue),
  );

  return true;
}
