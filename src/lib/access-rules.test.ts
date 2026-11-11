import { describe, expect, it } from "vitest";
import { canRevokeOwnerSession, isAuthorizedProfile, matchesSiteOrigin } from "./access-rules";
describe("owner mutual shielding", () => {
  it("blocks Synex from revoking Otávio", () => expect(canRevokeOwnerSession("synex", "otavio", "otavio.arcarneiro@gmail.com")).toBe(false));
  it("blocks Otávio from revoking Synex", () => expect(canRevokeOwnerSession("otavio", "synex", "synex.presence@gmail.com")).toBe(false));
  it("allows own devices", () => expect(canRevokeOwnerSession("synex", "synex", "synex.presence@gmail.com")).toBe(true));
});
describe("Google authorization", () => {
  it("blocks uncatalogued users", () => expect(isAuthorizedProfile(undefined, 0)).toBe(false));
  it("blocks suspended users", () => expect(isAuthorizedProfile("suspended", 1)).toBe(false));
  it("allows active registered users", () => expect(isAuthorizedProfile("active", 1)).toBe(true));
});
describe("site collection", () => {
  it("rejects unrelated origins", () => expect(matchesSiteOrigin("https://synexdigital.com.br", "https://attacker.test")).toBe(false));
  it("accepts registered origin", () => expect(matchesSiteOrigin("https://synexdigital.com.br/", "https://synexdigital.com.br")).toBe(true));
});