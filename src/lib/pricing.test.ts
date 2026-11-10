import { describe, expect, it } from "vitest";
import { monthlyFee } from "./pricing";
import { lockAfterFailures } from "./backoff";

describe("mensalidade", () => {
  it("contrato a partir de agosto paga R$ 147 no mesmo ano", () => {
    expect(monthlyFee("2026-08-01", new Date("2026-11-10"))).toBe(147);
  });
  it("contrato antes de agosto paga R$ 200", () => {
    expect(monthlyFee("2026-07-31", new Date("2026-11-10"))).toBe(200);
  });
  it("em 1º de janeiro o contrato de R$ 147 vira R$ 200", () => {
    expect(monthlyFee("2026-09-15", new Date("2027-01-01T10:00:00"))).toBe(200);
  });
});

describe("backoff de login", () => {
  it("3 erros bloqueiam por 10 minutos", () => expect(lockAfterFailures(3)).toEqual({ cooldownMinutes: 10, adminLock: false }));
  it("4 erros bloqueiam por 15 minutos", () => expect(lockAfterFailures(4).cooldownMinutes).toBe(15));
  it("5 erros bloqueiam por 20 minutos", () => expect(lockAfterFailures(5).cooldownMinutes).toBe(20));
  it("6ª falha gera bloqueio administrativo", () => expect(lockAfterFailures(6).adminLock).toBe(true));
  it("2 erros não bloqueiam", () => expect(lockAfterFailures(2)).toEqual({ cooldownMinutes: null, adminLock: false }));
});
