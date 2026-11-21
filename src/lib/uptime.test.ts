import { describe, expect, it, vi } from "vitest";
import { checkSite, classifyStatusCode, isPublicAddress, pinLookup, probePublicSite, validateUptimeUrl } from "./uptime.server";

describe("uptime public destinations", () => {
  it.each([
    "127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "100.100.100.200", "224.0.0.1", "192.0.2.1", "198.18.0.1", "::1", "::", "fc00::1",
    "fe80::1", "ff02::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "2002:7f00:1::",
  ])("rejects nonpublic address %s", (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("accepts public address %s", (address) => expect(isPublicAddress(address)).toBe(true));
  it.each([
    "file:///etc/passwd", "ftp://example.com", "http://localhost", "http://localhost.", "http://router",
    "http://metadata.google.internal", "http://foo.local", "http://2130706433", "http://0x7f000001",
    "http://127.1", "http://[::ffff:127.0.0.1]", "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (value) => expect(() => validateUptimeUrl(value)).toThrow());
  it("allows ordinary public URLs", () => expect(validateUptimeUrl("https://synexdigital.com.br/path?q=1#fragment").href).toBe("https://synexdigital.com.br/path?q=1"));
});

describe("pinned Node lookup", () => {
  it("returns one validated IPv4 address in single-address mode", () => {
    const callback = vi.fn();
    pinLookup("1.1.1.1")("example.com", { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, "1.1.1.1", 4);
  });
  it("returns the same validated IPv4 address in all-addresses mode", () => {
    const callback = vi.fn();
    pinLookup("1.1.1.1")("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "1.1.1.1", family: 4 }]);
  });
});

describe("uptime redirect and DNS guards", () => {
  const publicDns = async () => ["1.1.1.1"];
  it("rejects internal redirects before another network request", async () => {
    const request = vi.fn().mockResolvedValue({ status: 302, location: "http://169.254.169.254/latest/meta-data" });
    await expect(probePublicSite("https://example.com", publicDns, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed public/private DNS before fetching", async () => {
    const request = vi.fn();
    await expect(probePublicSite("https://example.com", async () => ["1.1.1.1", "10.0.0.1"], request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("revalidates DNS for every hop, including the same host", async () => {
    const dns = vi.fn().mockResolvedValueOnce(["1.1.1.1"]).mockResolvedValueOnce(["127.0.0.1"]);
    const request = vi.fn().mockResolvedValue({ status: 302, location: "/next" });
    await expect(probePublicSite("https://example.com", dns, request)).rejects.toThrow();
    expect(dns).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("follows valid relative redirects", async () => {
    const request = vi.fn().mockResolvedValueOnce({ status: 301, location: "/ok" }).mockResolvedValueOnce({ status: 200, location: null });
    await expect(probePublicSite("https://example.com", publicDns, request)).resolves.toBe(200);
    expect(request.mock.calls[1]?.[0].pathname).toBe("/ok");
  });
  it("limits redirect loops", async () => {
    const request = vi.fn().mockResolvedValue({ status: 302, location: "/loop" });
    await expect(probePublicSite("https://example.com", publicDns, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(5);
  });
});

describe("uptime status classification", () => {
  it("2xx/3xx rápido é online", () => expect(classifyStatusCode(200, 500)).toBe("online"));
  it("2xx lento é warning", () => expect(classifyStatusCode(200, 4000)).toBe("warning"));
  it.each([401, 403, 404, 429])("4xx (%i) é warning, nunca down", (code) => expect(classifyStatusCode(code, 100)).toBe("warning"));
  it.each([500, 502, 503, 504])("5xx (%i) é down", (code) => expect(classifyStatusCode(code, 100)).toBe("down"));
});

describe("uptime dupla checagem", () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  it("uma falha isolada não marca down", async () => {
    const probe = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(200);
    await expect(checkSite("https://example.com", probe, sleep)).resolves.toEqual({ status: "online", inconclusive: false });
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it("só marca down após duas falhas", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await checkSite("https://example.com", probe, sleep);
    expect(result.status).toBe("down");
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it("5xx seguido de 200 é online", async () => {
    const probe = vi.fn().mockResolvedValueOnce(503).mockResolvedValueOnce(200);
    await expect(checkSite("https://example.com", probe, sleep)).resolves.toMatchObject({ status: "online" });
  });
  it("4xx não dispara nova tentativa", async () => {
    const probe = vi.fn().mockResolvedValue(403);
    await expect(checkSite("https://example.com", probe, sleep)).resolves.toMatchObject({ status: "warning" });
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("falha do validador/DNS é inconclusiva e não repete", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("Não foi possível validar o destino."));
    await expect(checkSite("https://example.com", probe, sleep)).resolves.toEqual({ status: "down", inconclusive: true });
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
