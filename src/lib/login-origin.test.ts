import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

let request = new Request("http://localhost:8080");
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => request }));
vi.mock("./server-helpers.server", () => ({ sha256: async (value: string) => {
  const bytes = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
} }));
import { beginOriginLogin, finishOriginLogin } from "./login-origin.server";

describe("login penalties are origin scoped, never victim scoped", () => {
  const rpc = vi.fn();
  const client = { rpc } as any;
  beforeEach(() => {
    request = new Request("https://os-synex.lovable.app", { headers: { "cf-connecting-ip": "198.51.100.10" } });
    rpc.mockReset().mockResolvedValue({ data: { status: "allowed" }, error: null });
  });
  it("does not trust forged forwarded IP headers", async () => {
    const a = await beginOriginLogin(client);
    request = new Request("https://os-synex.lovable.app", { headers: { "cf-connecting-ip": "198.51.100.10", "x-forwarded-for": "1.2.3.4" } });
    const b = await beginOriginLogin(client);
    expect(a.key).toBe(b.key);
  });
  it("different trusted origins cannot penalize one another", async () => {
    const a = await beginOriginLogin(client);
    request = new Request("https://os-synex.lovable.app", { headers: { "cf-connecting-ip": "198.51.100.20" } });
    const b = await beginOriginLogin(client);
    expect(a.key).not.toBe(b.key);
  });
  it("fails closed without trusted origin on published domains", async () => {
    request = new Request("https://os-synex.lovable.app", { headers: { "x-forwarded-for": "1.2.3.4" } });
    await expect(beginOriginLogin(client)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("failed passwords invoke only the origin-scoped atomic RPC", async () => {
    const attempt = await beginOriginLogin(client);
    rpc.mockResolvedValueOnce({ data: { status: "invalid", attemptsLeft: 2 }, error: null });
    await finishOriginLogin(client, attempt, false, "victim@example.com", { ip: "198.51.100.10" });
    expect(rpc).toHaveBeenLastCalledWith("finish_origin_login", expect.objectContaining({ _key: attempt.key, _token: attempt.token, _success: false }));
  });
  it("fails closed if persistence fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "internal details" } });
    await expect(beginOriginLogin(client)).rejects.toThrow("Não foi possível validar a segurança do acesso.");
  });
});