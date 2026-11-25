
// Envio de e-mails institucionais da Synex via Resend (servidor apenas).
import { pushToOwners } from "./push.server";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
export const OWNER_ALERT_EMAIL = "otavio.arcarneiro@gmail.com";
export const FROM_SUPORTE = "Synex Suporte <suporte@synexdigital.com.br>";
export const FROM_ACESSO = "Synex Acesso <acesso@synexdigital.com.br>";
export const FROM_SAC = "Synex SAC <sac@synexdigital.com.br>";
export const FROM_UPTIME = "Synex Uptime <uptime@synexdigital.com.br>";
export const FROM_FINANCEIRO = "Synex Financeiro <financeiro@synexdigital.com.br>";
export const PIX_KEY = "synex.presence@gmail.com";
const APP_URL = "https://os.synexdigital.com.br";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateBR = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const nowBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function layout(title: string, rows: string[], cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Manrope,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#111318;border-radius:12px;overflow:hidden">
<tr><td style="background:#0D1930;padding:20px 28px;color:#ffffff;font-family:Montserrat,Arial,sans-serif;font-weight:700;letter-spacing:2px">SYNEX</td></tr>
<tr><td style="padding:28px;color:#E5E7EB;font-size:15px;line-height:1.6">
<h1 style="font-family:Montserrat,Arial,sans-serif;font-size:20px;color:#ffffff;margin:0 0 16px">${esc(title)}</h1>
${rows.map((r) => `<p style="margin:0 0 12px">${r}</p>`).join("")}
${cta ? `<p style="margin:20px 0 0"><a href="${cta.url}" style="background:#3478F6;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : ""}
</td></tr><tr><td style="padding:16px 28px;color:#6B7280;font-size:12px;background:#1A1E27">Synex Digital Presence · synexdigital.com.br</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendEmail(from: string, to: string, subject: string, html: string) {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const resendKey = process.env['RESEND_API_KEY'];
  if (!lovableKey || !resendKey) throw new Error("Serviço de e-mail não configurado");
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": resendKey },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend falhou [${res.status}]: ${body}`);
    throw new Error(`Falha no envio de e-mail [${res.status}]`);
  }
}

export async function sendDownAlert(p: { name: string; url: string | null }) {
  const html = layout("Site fora do ar", [
    `O monitoramento detectou queda em <b>${esc(p.name)}</b>.`,
    `Endereço: ${esc(p.url ?? "-")}`, `Horário: ${nowBR()}`,
  ], { label: "Abrir Projetos", url: `${APP_URL}/app/projetos` });
  await pushToOwners("uptime_down", { title: "Site fora do ar", body: p.name, url: "/app/projetos" });
  await sendEmail(FROM_UPTIME, OWNER_ALERT_EMAIL, `Queda detectada: ${p.name}`, html);
}

export async function sendUpAlert(p: { name: string; url: string | null }) {
  const html = layout("Site recuperado", [
    `O monitoramento confirmou que <b>${esc(p.name)}</b> voltou a funcionar.`,
    `Endereço: ${esc(p.url ?? "-")}`,
    `Horário: ${nowBR()}`,
  ], {
    label: "Abrir Projetos",
    url: `${APP_URL}/app/projetos`,
  });

  await pushToOwners("uptime_up", {
    title: "Site voltou ao ar",
    body: p.name,
    url: "/app/projetos",
  });

  await sendEmail(
    FROM_UPTIME,
    OWNER_ALERT_EMAIL,
    `Site recuperado: ${p.name}`,
    html,
  );
}

export async function sendLockAlert(p: { email: string; ip?: string; device?: string; browser?: string; os?: string }) {
  await pushToOwners("login_lock", { title: "Login bloqueado", body: p.email, url: "/app/restrita" });
  const html = layout("Login bloqueado por tempo indeterminado", [
    `Após 6 tentativas com erro, o acesso foi retido. <b>Somente o proprietário pode liberar.</b>`,
    `Conta tentada: ${esc(p.email)}`,
    `IP: ${esc(p.ip ?? "-")} · Dispositivo: ${esc([p.device, p.os, p.browser].filter(Boolean).join(" / ") || "-")}`,
    `Horário: ${nowBR()}`,
  ], { label: "Revisar e liberar", url: `${APP_URL}/app/restrita` });
  await sendEmail(FROM_SUPORTE, OWNER_ALERT_EMAIL, `Bloqueio administrativo de login: ${p.email}`, html);
}

type Inv = { amount: number; due_date: string; project: string; name: string };
export function reminderHtml(i: Inv, today: boolean) {
  return layout(today ? "Sua fatura vence hoje" : "Lembrete: fatura vence em 3 dias", [
    `Olá, ${esc(i.name)}.`,
    `A mensalidade de <b>${esc(i.project)}</b> no valor de <b>${brl(i.amount)}</b> ${today ? "vence hoje" : "vence em"} ${dateBR(i.due_date)}.`,
    `Pagamento via PIX: <b>${PIX_KEY}</b>`,
    `Se já pagou, desconsidere esta mensagem.`,
  ]);
}
// Cobrança manual ("Enviar fatura"): dados da fatura + chave PIX, disparo imediato.
export function invoiceHtml(i: Inv, overdue: boolean) {
  return layout(overdue ? "Fatura Synex em atraso" : "Sua fatura Synex", [
    `Olá, ${esc(i.name)}.`,
    `Segue a mensalidade de <b>${esc(i.project)}</b>:`,
    `Valor: <b>${brl(i.amount)}</b><br>Vencimento: <b>${dateBR(i.due_date)}</b>${overdue ? " (vencida)" : ""}`,
    `Pagamento via PIX (chave e-mail): <b>${PIX_KEY}</b>`,
    `Se já pagou, desconsidere esta mensagem.`,
  ]);
}
export function thanksHtml(i: Inv) {
  return layout("Pagamento confirmado", [
    `Olá, ${esc(i.name)}.`,
    `Confirmamos o pagamento de <b>${brl(i.amount)}</b> referente a <b>${esc(i.project)}</b> (vencimento ${dateBR(i.due_date)}).`,
    `Obrigado pela confiança!`,
  ]);
}

// 2FA por e-mail (equipe interna): código de 6 dígitos válido por 10 minutos, enviado por acesso@.
export function otpHtml(code: string) {
  return layout("Seu código de verificação", [
    `Use o código abaixo para concluir seu acesso ao Synex OS:`,
    `<span style="display:inline-block;background:#1A1E27;border:1px solid #3478F6;border-radius:8px;padding:12px 20px;font-family:monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#ffffff">${esc(code)}</span>`,
    `O código expira em <b>10 minutos</b> e só pode ser usado uma vez.`,
    `Se você não tentou entrar, ignore este e-mail e troque sua senha. Nunca compartilhe este código.`,
  ]);
}
export async function sendOtpEmail(to: string, code: string) {
  await sendEmail(FROM_ACESSO, to, "Seu código de verificação Synex", otpHtml(code));
}

// "Não tenho acesso ao e-mail": avisa o Proprietário (sac@) com atalho para a Central, onde ele libera manualmente.
export function twoFactorHelpHtml(p: { name: string | null; email: string; ip?: string; device?: string; browser?: string; os?: string }) {
  return layout("Colaborador sem acesso ao e-mail", [
    `<b>${esc(p.name || p.email)}</b> (${esc(p.email)}) informou que não tem acesso ao e-mail e não consegue concluir a verificação em duas etapas.`,
    `IP: ${esc(p.ip ?? "-")} · Dispositivo: ${esc([p.device, p.os, p.browser].filter(Boolean).join(" / ") || "-")}`,
    `Horário: ${nowBR()}`,
    `Só libere se você reconhecer a solicitação. A liberação vale por 30 minutos e dispensa o código uma única vez; a senha continua sendo exigida.`,
  ], { label: "Abrir Central e liberar acesso", url: `${APP_URL}/app/notificacoes` });
}
export async function sendTwoFactorHelpEmail(p: { name: string | null; email: string; fp: { ip?: string; device?: string; os?: string; browser?: string } }) {
  await pushToOwners("sac", { title: "Pedido de liberação de acesso", body: p.name || p.email, url: "/app/notificacoes" });
  await sendEmail(FROM_SAC, OWNER_ALERT_EMAIL, `Pedido de liberação de acesso: ${p.name || p.email}`, twoFactorHelpHtml({ name: p.name, email: p.email, ...p.fp }));
}

// Cobrança manual por cliente: um único e-mail com todas as faturas pendentes, total e chave PIX.
export type ClientInvoiceItem = { project: string; due_date: string; amount: number; overdue: boolean };
export function clientInvoicesHtml(name: string, items: ClientInvoiceItem[]) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  const lines = items.map((i) => `• <b>${esc(i.project)}</b> — vence ${dateBR(i.due_date)}${i.overdue ? " (vencida)" : ""} — <b>${brl(i.amount)}</b>`).join("<br>");
  return layout(items.some((i) => i.overdue) ? "Faturas Synex em aberto" : "Suas faturas Synex", [
    `Olá, ${esc(name)}.`,
    items.length === 1 ? "Segue a fatura em aberto:" : `Seguem as ${items.length} faturas em aberto:`,
    lines,
    `Total: <b>${brl(total)}</b>`,
    `Pagamento via PIX (chave e-mail): <b>${PIX_KEY}</b>`,
    `Se já pagou, desconsidere esta mensagem.`,
  ]);
}
