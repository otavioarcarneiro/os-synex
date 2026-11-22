import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { generateMonthInvoices, notifyInvoicePaid } from "@/lib/admin.functions";
import { sendClientInvoiceReminder, sendSelectedClientInvoices } from "@/lib/selected-client-invoices.functions";
import { brl, monthlyFee } from "@/lib/pricing";
import { PageTitle, Panel, StatCard, PIX_KEY } from "@/components/synex/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinanceClients } from "@/components/synex/finance-clients";
import { buildClientRows, type ClientInvoice, type ClientRow } from "@/lib/finance-clients";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Synex OS" },
      { name: "description", content: "Faturas e recorrência da Synex." },
      { property: "og:title", content: "Financeiro — Synex OS" },
      { property: "og:description", content: "Faturas e recorrência da Synex." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Finance,
});

function dateInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function Finance() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isOwner = me?.primaryRole === "owner";
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingClient, setSendingClient] = useState<string | null>(null);

  const {
    data,
    error: financeError,
    isError: financeIsError,
  } = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const [inv, proj, settings, roles] = await Promise.all([
        supabase
          .from("invoices")
          .select("id,project_id,amount,due_date,status,paid_at,sent_at")
          .order("due_date", { ascending: false }),
        supabase
          .from("projects")
          .select("id,name,kind,client_id,billing_enabled,contract_start"),
        supabase
          .from("system_settings")
          .select("billing_enabled")
          .eq("id", 1)
          .maybeSingle(),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
      ]);

      const queryError = inv.error ?? proj.error ?? settings.error ?? roles.error;
      if (queryError) {
        throw new Error(`Falha ao carregar os dados financeiros: ${queryError.message}`);
      }

      const projects = proj.data ?? [];
      const ids = [
        ...new Set([
          ...(roles.data ?? []).map((role) => role.user_id),
          ...projects.map((project) => project.client_id),
        ]),
      ];

      const clientsResult = ids.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,email,phone")
            .in("id", ids)
        : { data: [], error: null };

      if (clientsResult.error) {
        throw new Error(`Falha ao carregar os clientes: ${clientsResult.error.message}`);
      }

      return {
        invoices: inv.data ?? [],
        projects,
        clients: clientsResult.data ?? [],
        billingOn: settings.data?.billing_enabled ?? false,
      };
    },
  });

  const invoices = data?.invoices ?? [];
  const today = dateInSaoPaulo();
  const mrr = (data?.projects ?? [])
    .filter((project) => project.billing_enabled)
    .reduce((sum, project) => sum + monthlyFee(project.contract_start), 0);
  const received = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const open = invoices.filter((invoice) => invoice.status === "pending");
  const rows = useMemo(
    () => buildClientRows(data?.clients ?? [], data?.projects ?? [], invoices, today),
    [data, invoices, today],
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  async function sendClient(client: ClientRow, projectIds: string[]) {
    const chosen = client.projects.filter((project) => projectIds.includes(project.id));
    if (!chosen.length) return;
    const monthlyTotal = chosen.reduce((sum, project) => sum + project.fee, 0);
    if (
      !window.confirm(
        `Registrar como em aberto e enviar a fatura de ${chosen.length} projeto(s), no total de ${brl(monthlyTotal)}, para ${client.name} (${client.email})?\n\nProjetos que já têm fatura neste mês não são duplicados.`,
      )
    ) {
      return;
    }
    setSendingClient(client.id);
    try {
      const result = await sendSelectedClientInvoices({
        data: { clientId: client.id, projectIds },
      });
      toast.success(
        `Fatura de ${brl(result.total)} registrada em aberto e enviada para ${client.name}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a fatura");
    } finally {
      setSendingClient(null);
      await refresh();
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }

  async function sendReminder(client: ClientRow) {
    if (!window.confirm(`Reenviar as faturas em aberto para ${client.email}?`)) return;
    setSendingReminder(client.id);
    try {
      await sendClientInvoiceReminder({ data: { clientId: client.id } });
      toast.success("Lembrete enviado ao cliente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o lembrete");
    } finally {
      setSendingReminder(null);
      await refresh();
    }
  }

  async function markPaid(invoice: ClientInvoice) {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);
    if (error) return toast.error(error.message);

    toast.success("Baixa registrada");
    void refresh();
    notifyInvoicePaid({ data: { invoiceId: invoice.id } })
      .then((result) => result.sent && toast.success("Agradecimento enviado ao cliente"))
      .catch(() => toast.error("Baixa feita, mas o e-mail de agradecimento falhou"));
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Financeiro & Recorrência"
        subtitle="Mensalidade R$ 147 (contratos a partir de agosto) ou R$ 200 — virada para R$ 200 em 1º de janeiro."
        action={
          isOwner && (
            <Button
              onClick={async () => {
                try {
                  const result = await generateMonthInvoices();
                  toast.success(`${result.created} fatura(s) gerada(s)`);
                  void qc.invalidateQueries({ queryKey: ["finance"] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Erro ao gerar faturas");
                }
              }}
            >
              <Receipt className="h-4 w-4" /> Gerar faturas do mês
            </Button>
          )
        }
      />

      {financeIsError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Não foi possível carregar os dados do Financeiro. Atualize a página ou verifique as
          permissões e a conexão com o banco. Detalhe: {financeError.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Recorrência mensal" value={brl(mrr)} />
        <StatCard label="Total recebido" value={brl(received)} />
        <StatCard
          label="Em aberto"
          value={brl(open.reduce((sum, invoice) => sum + Number(invoice.amount), 0))}
          hint={`${open.length} fatura(s)`}
        />
      </div>

      <Panel
        title="Clientes e faturas"
        action={
          <Badge
            variant="outline"
            className={
              data?.billingOn ? "border-success text-success" : "border-warning text-warning"
            }
          >
            Cobrança automática {data?.billingOn ? "ligada" : "desligada"}
          </Badge>
        }
      >
        <FinanceClients
          rows={rows}
          actions={{
            isOwner,
            sendingClient,
            sendingReminder,
            onSendClient: sendClient,
            onSendReminder: sendReminder,
            onMarkPaid: markPaid,
          }}
        />
      </Panel>

      <Panel title="Dados de pagamento">
        <p className="text-sm text-muted-foreground">
          Chave PIX (e-mail): <span className="font-mono text-foreground">{PIX_KEY}</span> — em
          nome da responsável legal da Synex Digital Presence.
        </p>
      </Panel>
    </div>
  );
}
