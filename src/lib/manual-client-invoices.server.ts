import { FROM_FINANCEIRO, brl, clientInvoicesHtml, dateBR, sendEmail } from "./email.server";
import { monthlyFee } from "./pricing";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function admin(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function dueDateFor(contractStart: string, now: Date) {
  const day = Math.min(28, new Date(contractStart + "T12:00:00").getDate());
  const year = now.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" });
  const month = now.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", month: "2-digit" });
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

// Envio manual: cada confirmação cria uma nova fatura por projeto selecionado,
// independentemente de recorrência ou de faturas anteriores.
export async function createAndSendClientInvoices(clientId: string, projectIds: string[]) {
  const db = await admin();
  const uniqueIds = [...new Set(projectIds)];
  if (!uniqueIds.length) throw new Error("Selecione pelo menos um projeto.");

  const { data: profile, error: profileError } = await db.from("profiles")
    .select("full_name,email").eq("id", clientId).maybeSingle();
  if (profileError || !profile) throw new Error("Cliente não encontrado.");
  if (!profile.email) throw new Error("O cliente não tem e-mail cadastrado.");

  const { data: projects, error: projectsError } = await db.from("projects")
    .select("id,name,contract_start").eq("client_id", clientId).in("id", uniqueIds)
    .order("name", { ascending: true });
  if (projectsError) throw new Error("Não foi possível carregar os projetos do cliente.");
  if (!projects?.length || projects.length !== uniqueIds.length) {
    throw new Error("Um ou mais projetos selecionados não pertencem a este cliente.");
  }

  const now = new Date();
  const today = ymd(now);
  const items = projects.map((p: { id: string; name: string; contract_start: string }) => {
    const due_date = dueDateFor(p.contract_start, now);
    return { project_id: p.id, project: p.name, due_date, amount: monthlyFee(p.contract_start, now), overdue: due_date < today };
  });

  const { data: created, error: insertError } = await db.from("invoices").insert(
    items.map((item: (typeof items)[number]) => ({ project_id: item.project_id, amount: item.amount, due_date: item.due_date }))
  ).select("id");
  if (insertError || !created?.length) throw new Error("Não foi possível registrar as novas faturas.");

  const total = items.reduce((sum: number, item: (typeof items)[number]) => sum + item.amount, 0);
  const subject = items.length === 1
    ? `Cobrança Synex — ${items[0]!.project} — ${dateBR(items[0]!.due_date)}`
    : `Cobrança Synex — ${items.length} projetos — total ${brl(total)}`;

  try {
    await sendEmail(FROM_FINANCEIRO, profile.email, subject, clientInvoicesHtml(profile.full_name || "cliente", items));
  } catch (error) {
    // Não deixar faturas pendentes registradas se o e-mail não foi enviado.
    await db.from("invoices").delete().in("id", created.map((row: { id: string }) => row.id));
    console.error(error);
    throw new Error("Não foi possível enviar o e-mail. Nenhuma fatura nova foi mantida no histórico.");
  }

  const sentAt = new Date().toISOString();
  const { error: sentError } = await (db.from("invoices") as any)
    .update({ sent_at: sentAt }).in("id", created.map((row: { id: string }) => row.id));
  if (sentError) throw new Error("O e-mail foi enviado, mas não foi possível registrar a data de envio. Verifique o histórico antes de reenviar.");

  return { count: items.length, total, sentAt };
}

// Lembrete manual: reenvia um único e-mail consolidado com TODAS as faturas pendentes.
// Não cria nem atualiza registros, datas, status ou flags de lembrete.
export async function resendClientOpenInvoices(clientId: string) {
  const db = await admin();
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("full_name,email").eq("id", clientId).maybeSingle();
  if (profileError || !profile) throw new Error("Cliente não encontrado.");
  if (!profile.email) throw new Error("O cliente não tem e-mail cadastrado.");

  const { data: projects, error: projectsError } = await db.from("projects")
    .select("id,name").eq("client_id", clientId);
  if (projectsError) throw new Error("Não foi possível carregar os projetos do cliente.");
  const ids = (projects ?? []).map((p: { id: string }) => p.id);
  if (!ids.length) throw new Error("Este cliente não possui projetos cadastrados.");

  const { data: invoices, error: invoiceError } = await db.from("invoices")
    .select("amount,due_date,project_id").eq("status", "pending").in("project_id", ids)
    .order("due_date", { ascending: true });
  if (invoiceError) throw new Error("Não foi possível carregar as faturas em aberto.");
  if (!invoices?.length) throw new Error("Este cliente não possui faturas pendentes para lembrar.");

  const projectNames = new Map((projects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
  const today = ymd(new Date());
  const items = invoices.map((i: { amount: number | string; due_date: string; project_id: string }) => ({
    project: projectNames.get(i.project_id) ?? "Projeto",
    due_date: i.due_date,
    amount: Number(i.amount),
    overdue: i.due_date < today,
  }));
  const total = items.reduce((sum: number, item: (typeof items)[number]) => sum + item.amount, 0);
  await sendEmail(
    FROM_FINANCEIRO,
    profile.email,
    items.length === 1 ? `Lembrete de fatura Synex — ${items[0]!.project}` : `Lembrete: ${items.length} faturas Synex em aberto — ${brl(total)}`,
    clientInvoicesHtml(profile.full_name || "cliente", items),
  );
  return { count: items.length, total };
}
