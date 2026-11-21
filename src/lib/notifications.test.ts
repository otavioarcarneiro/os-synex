import { describe, expect, it } from "vitest";
import { invoiceNotifications, loginNotifications, sacNotifications, sortNotifications, uptimeNotifications } from "./notifications";

describe("central de notificações", () => {
  it("uptime: só sites em queda ou instáveis; queda é danger", () => {
    const r = uptimeNotifications([
      { id: "1", name: "A", url: "https://a.com", uptime_status: "down", uptime_checked_at: "2026-11-20T10:00:00Z" },
      { id: "2", name: "B", url: null, uptime_status: "warning", uptime_checked_at: null },
      { id: "3", name: "C", url: "https://c.com", uptime_status: "online", uptime_checked_at: null },
    ]);
    expect(r.map((x) => [x.id, x.severity])).toEqual([["uptime:1", "danger"], ["uptime:2", "warning"]]);
    expect(r[0]!.detail).toContain("https://a.com");
  });
  it("login: bloqueio ativo é danger e resolvido é info", () => {
    const base = { email: "a@b.com", full_name: null, attempts: 6, created_at: "2026-11-20T10:00:00Z", lock_scope: "origin" };
    const r = loginNotifications([{ id: "1", resolved: false, ...base }, { id: "2", resolved: true, ...base }]);
    expect(r.map((x) => x.severity)).toEqual(["danger", "info"]);
    expect(r[0]!.detail).toContain("origem bloqueada");
  });
  it("faturas: um card por envio registrado", () => {
    const r = invoiceNotifications([{
      id: "i1", amount: 147, due_date: "2026-12-05", reminder_sent_at: "2026-12-02T09:00:00Z", due_notice_sent_at: null, thanks_sent_at: "2026-12-05T15:00:00Z",
      project: { name: "Site X", client: { full_name: "Ana", email: "a@x.com" } },
    }]);
    expect(r.map((x) => x.id)).toEqual(["invoice:i1:reminder", "invoice:i1:thanks"]);
    expect(r[0]!.detail).toContain("Site X");
    expect(r[0]!.detail).toContain("Ana");
  });
  it("SAC: aguardando humano é danger", () => {
    const r = sacNotifications([
      { id: "1", status: "human", created_at: "2026-11-20T10:00:00Z", client: { full_name: "Ana" } },
      { id: "2", status: "ai", created_at: "2026-11-19T10:00:00Z", client: null },
      { id: "3", status: "closed", created_at: "2026-11-18T10:00:00Z", client: { email: "z@z.com" } },
    ]);
    expect(r.map((x) => x.severity)).toEqual(["danger", "info", "success"]);
    expect(r[1]!.detail).toBe("Cliente");
  });
  it("ordena do mais recente ao mais antigo; sem data vai para o fim", () => {
    const mk = (id: string, at: string) => ({ id, kind: "sac" as const, severity: "info" as const, title: "", detail: "", at, href: "/app/suporte" as const });
    expect(sortNotifications([mk("a", ""), mk("b", "2026-01-01T00:00:00Z"), mk("c", "2026-06-01T00:00:00Z")]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
