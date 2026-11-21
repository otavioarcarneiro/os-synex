import { describe, expect, it } from "vitest";
import {
  CYCLE_WINDOW_MS, MAX_CODES_PER_CYCLE, OTP_TTL_MS, RESEND_COOLDOWN_MS, applyFailure, decideSend, freshState, generateOtp, hasValidCode,
  hashOtp, isPasswordOnlyAmr, isStaffRole, otpInfo, otpLockAfterErrors, requiresOtp, safeEqual,
} from "./twofactor-rules";

const T0 = Date.parse("2026-11-21T12:00:00Z");

describe("escopo do 2FA", () => {
  it("só Proprietário, Sócio e Administrador", () => {
    expect(isStaffRole(["owner"])).toBe(true);
    expect(isStaffRole(["partner"])).toBe(true);
    expect(isStaffRole(["admin"])).toBe(true);
    expect(isStaffRole(["client"])).toBe(false);
    expect(isStaffRole([])).toBe(false);
  });
  it("exige OTP apenas a partir do 2º acesso", () => {
    expect(requiresOtp(true, 0)).toBe(false);
    expect(requiresOtp(true, 1)).toBe(true);
    expect(requiresOtp(false, 5)).toBe(false);
  });
});

describe("código OTP", () => {
  it("tem sempre 6 dígitos", () => { for (let i = 0; i < 2000; i++) expect(generateOtp()).toMatch(/^\d{6}$/); });
  it("hash depende do usuário e do código; comparação em tempo constante", async () => {
    const a = await hashOtp("u1", "123456");
    expect(a).toBe(await hashOtp("u1", "123456"));
    expect(a).not.toBe(await hashOtp("u2", "123456"));
    expect(a).not.toBe(await hashOtp("u1", "123457"));
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, "x")).toBe(false);
  });
  it("expira em 10 minutos", () => {
    const d = decideSend(freshState(), T0);
    if (d.kind !== "send") throw new Error("esperava envio");
    const s = { ...freshState(), ...d.patch, codeHash: "h" };
    expect(new Date(s.codeExpiresAt!).getTime() - T0).toBe(OTP_TTL_MS);
    expect(hasValidCode(s, T0 + OTP_TTL_MS - 1)).toBe(true);
    expect(hasValidCode(s, T0 + OTP_TTL_MS + 1)).toBe(false);
  });
});

describe("reenvio: 60s e no máximo 3 códigos por ciclo", () => {
  const send = (s: ReturnType<typeof freshState>, now: number) => {
    const d = decideSend(s, now);
    return d.kind === "send" ? { d, s: { ...s, ...d.patch, codeHash: "h" } } : { d, s };
  };
  it("bloqueia reenvio antes de 60s e libera depois", () => {
    const first = send(freshState(), T0);
    expect(first.d.kind).toBe("send");
    const early = decideSend(first.s, T0 + RESEND_COOLDOWN_MS - 1000);
    expect(early.kind).toBe("wait");
    expect(decideSend(first.s, T0 + RESEND_COOLDOWN_MS).kind).toBe("send");
  });
  it("permite 1 código inicial + 2 reenvios e recusa o 4º", () => {
    let s = freshState(); let t = T0;
    for (let i = 0; i < MAX_CODES_PER_CYCLE; i++) { const r = send(s, t); expect(r.d.kind).toBe("send"); s = r.s; t += RESEND_COOLDOWN_MS; }
    expect(s.codesSent).toBe(3);
    expect(decideSend(s, t).kind).toBe("limit");
    expect(otpInfo(s, t).limitReached).toBe(true);
    expect(otpInfo(s, t).codesLeft).toBe(0);
  });
  it("novo ciclo depois da janela", () => {
    let s = freshState(); let t = T0;
    for (let i = 0; i < 3; i++) { s = send(s, t).s; t += RESEND_COOLDOWN_MS; }
    expect(decideSend(s, T0 + CYCLE_WINDOW_MS + 1000).kind).toBe("send");
  });
});

describe("backoff progressivo de erros no OTP", () => {
  it("3 erros avisam; 4º = 2 min; 5º = 5 min; 6º = bloqueio administrativo", () => {
    expect(otpLockAfterErrors(1)).toEqual({ warning: false, cooldownMinutes: null, adminLock: false });
    expect(otpLockAfterErrors(2)).toEqual({ warning: false, cooldownMinutes: null, adminLock: false });
    expect(otpLockAfterErrors(3)).toEqual({ warning: true, cooldownMinutes: null, adminLock: false });
    expect(otpLockAfterErrors(4)).toEqual({ warning: false, cooldownMinutes: 2, adminLock: false });
    expect(otpLockAfterErrors(5)).toEqual({ warning: false, cooldownMinutes: 5, adminLock: false });
    expect(otpLockAfterErrors(6).adminLock).toBe(true);
    expect(otpLockAfterErrors(9).adminLock).toBe(true);
  });
  it("applyFailure grava a data do bloqueio; proprietário nunca fica em bloqueio indeterminado", () => {
    const s = { ...freshState(), failedAttempts: 3 };
    const f4 = applyFailure(s, T0, false);
    expect(new Date(f4.patch.lockedUntil!).getTime() - T0).toBe(2 * 60000);
    const f6 = applyFailure({ ...s, failedAttempts: 5 }, T0, false);
    expect(f6.adminLock).toBe(true);
    const owner6 = applyFailure({ ...s, failedAttempts: 5 }, T0, true);
    expect(owner6.adminLock).toBe(false);
    expect(new Date(owner6.patch.lockedUntil!).getTime() - T0).toBe(5 * 60000);
  });
});

describe("sessão obtida só por senha", () => {
  it("detecta apenas o método password", () => {
    expect(isPasswordOnlyAmr([{ method: "password", timestamp: 1 }])).toBe(true);
    expect(isPasswordOnlyAmr([{ method: "recovery" }])).toBe(false);
    expect(isPasswordOnlyAmr([{ method: "password" }, { method: "otp" }])).toBe(false);
    expect(isPasswordOnlyAmr(undefined)).toBe(false);
    expect(isPasswordOnlyAmr([])).toBe(false);
  });
});
