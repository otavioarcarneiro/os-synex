// Regra de mensalidade Synex:
// - contrato iniciado a partir de agosto: R$ 147/mês, só até o fim daquele ano
// - contrato iniciado antes de agosto: R$ 200/mês
// - em 1º de janeiro, contratos de R$ 147 passam para R$ 200
export const FEE_STANDARD = 200;
export const FEE_PROMO = 147;

export function monthlyFee(contractStart: string | Date, reference: Date = new Date()): number {
  const start = typeof contractStart === "string" ? new Date(contractStart + "T12:00:00") : contractStart;
  if (reference.getFullYear() > start.getFullYear()) return FEE_STANDARD;
  return start.getMonth() >= 7 ? FEE_PROMO : FEE_STANDARD;
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
