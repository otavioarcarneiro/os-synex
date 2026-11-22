import { describe, it, expect } from "vitest";
import { pushRecipients, canSeeInstallPrompt, isGoneStatus } from "./push-rules";

describe("notificações no aparelho", () => {
  it("só Proprietários recebem", () => {
    expect(pushRecipients([
      { user_id: "a", role: "owner" }, { user_id: "b", role: "partner" },
      { user_id: "c", role: "admin" }, { user_id: "d", role: "client" }, { user_id: "a", role: "owner" },
    ])).toEqual(["a"]);
  });
  it("convite de instalação só para equipe interna", () => {
    expect(canSeeInstallPrompt("owner")).toBe(true);
    expect(canSeeInstallPrompt("partner")).toBe(true);
    expect(canSeeInstallPrompt("admin")).toBe(true);
    expect(canSeeInstallPrompt("client")).toBe(false);
  });
  it("inscrição expirada é removida", () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
  });
});
