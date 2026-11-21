import { beforeEach, describe, expect, it, vi } from "vitest";
import { twoFactorGate, type GateCtx, type GateDeps, type TfRepo } from "./twofactor.server";
import { freshState, type TfState } from "./twofactor-rules";

const T0 = Date.parse("2026-11-21T12:00:00Z");
let now = T0;
let roles: string[] = ["admin"];
let table: { state: TfState } | { missing: true } = { state: { ...freshState(), completedLogins: 1 } };
let ticket = 0;
const calls = { adminLock: 0, tickets: 0 };

const repo: TfRepo = {
  roles: async () => roles,
  load: async () => ("missing" in table ? table : { state: { ...table.state } }),
  save: async (_u, patch) => { if (!("missing" in table)) table = { state: { ...table.state, ...patch } }; },
  claimCode: async (_u, hash, patch) => { if ("missing" in table || table.state.codeHash !== hash) return false; table = { state: { ...table.state, ...patch } }; return true; },
  bumpFailure: async (_u, cur, patch) => { if ("missing" in table || table.state.failedAttempts !== cur) return false; table = { state: { ...table.state, ...patch } }; return true; },
  profile: async () => ({ name: "Ana", email: "ana@synex.com" }),
  createSacTicket: async () => { calls.tickets++; return `t${++ticket}`; },
  adminLock: async () => { calls.adminLock++; },
};
const sent: string[] = [];
const sendOtp = vi.fn(async (_to: string, code: string) => { sent.push(code); });
const sendHelp = vi.fn(async () => {});
const alertLock = vi.fn(async () => {});
const deps = (): GateDeps => ({ repo, now: () => now, genCode: () => "424242", sendOtp, sendHelp, alertLock });
const ctx = (over: Partial<GateCtx> = {}): GateCtx => ({ userId: "u1", email: "ana@synex.com", owner: false, action: "login", fp: { ip: "1.2.3.4" }, ...over });
const st = () => ("missing" in table ? freshState() : table.state);

beforeEach(() => {
  now = T0; roles = ["admin"]; table = { state: { ...freshState(), completedLogins: 1 } }; sent.length = 0; ticket = 0; calls.adminLock = 0; calls.tickets = 0;
  sendOtp.mockClear(); sendHelp.mockClear(); alertLock.mockClear(); sendOtp.mockImplementation(async (_t, c) => { sent.push(c); });
});

describe("2FA: quando se aplica", () => {
  it("cliente nunca recebe 2FA", async () => { roles = ["client"]; expect(await twoFactorGate(ctx(), deps())).toBeNull(); expect(sendOtp).not.toHaveBeenCalled(); });
  it("1º acesso da equipe segue sem código e é registrado", async () => {
    table = { state: freshState() };
    expect(await twoFactorGate(ctx(), deps())).toBeNull();
    expect(st().completedLogins).toBe(1);
    expect(sendOtp).not.toHaveBeenCalled();
  });
  it("2º acesso exige código e não libera o login", async () => {
    const r = await twoFactorGate(ctx(), deps());
    expect(r).toMatchObject({ status: "otp_required", sent: true, codesLeft: 2 });
    expect(sendOtp).toHaveBeenCalledWith("ana@synex.com", "424242");
  });
  it("tabela inexistente: login segue como antes (rollout seguro)", async () => {
    table = { missing: true };
    expect(await twoFactorGate(ctx(), deps())).toBeNull();
  });
});

describe("2FA: código e reenvio", () => {
  it("código correto libera o login, é de uso único e zera contadores", async () => {
    await twoFactorGate(ctx(), deps());
    expect(await twoFactorGate(ctx({ otp: "424242" }), deps())).toBeNull();
    expect(st()).toMatchObject({ codeHash: null, failedAttempts: 0, codesSent: 0, completedLogins: 2 });
    expect(await twoFactorGate(ctx({ otp: "424242" }), deps())).toMatchObject({ status: "otp_invalid", reason: "expired" });
  });
  it("código expira em 10 minutos e não conta como erro", async () => {
    await twoFactorGate(ctx(), deps());
    now += 10 * 60 * 1000 + 1000;
    expect(await twoFactorGate(ctx({ otp: "424242" }), deps())).toMatchObject({ status: "otp_invalid", reason: "expired" });
    expect(st().failedAttempts).toBe(0);
  });
  it("novo login com código válido não gasta cota de envio", async () => {
    await twoFactorGate(ctx(), deps());
    now += 5000;
    expect(await twoFactorGate(ctx(), deps())).toMatchObject({ status: "otp_required", sent: false });
    expect(sendOtp).toHaveBeenCalledTimes(1);
  });
  it("reenvio: bloqueia antes de 60s, libera depois e limita a 3 códigos", async () => {
    await twoFactorGate(ctx(), deps());
    now += 30_000;
    expect(await twoFactorGate(ctx({ action: "resend" }), deps())).toMatchObject({ sent: false });
    now += 31_000;
    expect(await twoFactorGate(ctx({ action: "resend" }), deps())).toMatchObject({ sent: true, codesLeft: 1 });
    now += 61_000;
    expect(await twoFactorGate(ctx({ action: "resend" }), deps())).toMatchObject({ sent: true, codesLeft: 0, limitReached: true });
    now += 61_000;
    expect(await twoFactorGate(ctx({ action: "resend" }), deps())).toMatchObject({ sent: false, limitReached: true });
    expect(sendOtp).toHaveBeenCalledTimes(3);
  });
  it("falha no e-mail devolve erro e não consome a cota", async () => {
    sendOtp.mockRejectedValueOnce(new Error("resend down"));
    await expect(twoFactorGate(ctx(), deps())).rejects.toThrow("enviar o código");
    expect(st().codesSent).toBe(0);
    expect(st().codeHash).toBeNull();
  });
});

describe("2FA: backoff de erros", () => {
  const wrong = () => twoFactorGate(ctx({ otp: "000000" }), deps());
  beforeEach(async () => { await twoFactorGate(ctx(), deps()); });
  it("3º erro avisa, 4º bloqueia 2 min, 5º 5 min, 6º bloqueio administrativo", async () => {
    expect(await wrong()).toMatchObject({ status: "otp_invalid", reason: "wrong", warning: false });
    expect(await wrong()).toMatchObject({ warning: false });
    expect(await wrong()).toMatchObject({ status: "otp_invalid", warning: true });
    const r4 = await wrong();
    expect(r4).toMatchObject({ status: "otp_cooldown" });
    expect(new Date((r4 as { until: string }).until).getTime() - now).toBe(2 * 60000);
    // durante o bloqueio, nem o código certo funciona
    expect(await twoFactorGate(ctx({ otp: "424242" }), deps())).toMatchObject({ status: "otp_cooldown" });
    now += 2 * 60000 + 1000;
    const r5 = await wrong();
    expect(new Date((r5 as { until: string }).until).getTime() - now).toBe(5 * 60000);
    now += 5 * 60000 + 1000;
    expect(await wrong()).toEqual({ status: "admin_locked" });
    expect(calls.adminLock).toBe(1);
    expect(alertLock).toHaveBeenCalledTimes(1);
  });
  it("proprietário não entra em bloqueio indeterminado", async () => {
    for (let i = 0; i < 3; i++) await twoFactorGate(ctx({ otp: "000000", owner: true }), deps());
    await twoFactorGate(ctx({ otp: "000000", owner: true }), deps()); now += 2 * 60000 + 1000;
    await twoFactorGate(ctx({ otp: "000000", owner: true }), deps()); now += 5 * 60000 + 1000;
    expect(await twoFactorGate(ctx({ otp: "000000", owner: true }), deps())).toMatchObject({ status: "otp_cooldown" });
    expect(calls.adminLock).toBe(0);
  });
  it("erros em corrida não escapam da contagem (otimismo)", async () => {
    const a = wrong(), b = wrong();
    await Promise.all([a, b]);
    expect(st().failedAttempts).toBe(2);
  });
});

describe("2FA: 'Não tenho acesso ao e-mail'", () => {
  it("abre demanda no SAC, avisa o Proprietário e não duplica em 30 min", async () => {
    expect(await twoFactorGate(ctx({ action: "no_email" }), deps())).toEqual({ status: "help_sent" });
    expect(calls.tickets).toBe(1);
    expect(sendHelp).toHaveBeenCalledTimes(1);
    expect(st()).toMatchObject({ sacTicketId: "t1" });
    expect(st().releaseRequestedAt).not.toBeNull();
    now += 60_000;
    await twoFactorGate(ctx({ action: "no_email" }), deps());
    expect(calls.tickets).toBe(1);
  });
  it("falha no e-mail do Proprietário não perde a demanda do SAC", async () => {
    sendHelp.mockRejectedValueOnce(new Error("x"));
    expect(await twoFactorGate(ctx({ action: "no_email" }), deps())).toEqual({ status: "help_sent" });
    expect(calls.tickets).toBe(1);
  });
  it("liberação manual vale uma vez, dispensa o código e exige a senha (gate só roda após a senha)", async () => {
    table = { state: { ...st(), manualReleaseUntil: new Date(now + 30 * 60000).toISOString() } };
    expect(await twoFactorGate(ctx(), deps())).toBeNull();
    expect(st().manualReleaseUntil).toBeNull();
    expect(await twoFactorGate(ctx(), deps())).toMatchObject({ status: "otp_required" });
  });
  it("liberação expirada não vale", async () => {
    table = { state: { ...st(), manualReleaseUntil: new Date(now - 1000).toISOString() } };
    expect(await twoFactorGate(ctx(), deps())).toMatchObject({ status: "otp_required" });
  });
});
