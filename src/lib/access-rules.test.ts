import { describe, expect, it } from "vitest";
import { canRevokeOwnerSession, isAuthorizedProfile, matchesSiteOrigin } from "./access-rules";
describe("owner mutual shielding", () => {
  it("blocks Synex from revoking Otávio", () => expect(canRevokeOwnerSession("synex", "otavio", true)).toBe(false));
  it("blocks Otávio from revoking Synex", () => expect(canRevokeOwnerSession("otavio", "synex", true)).toBe(false));
  it("allows revoking non-owners", () => expect(canRevokeOwnerSession("synex", "client1", false)).toBe(true));
  it("allows own devices", () => expect(canRevokeOwnerSession("synex", "synex", true)).toBe(true));
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