import { describe, expect, it } from "vitest";
import { selectParty } from "../../scripts/core/party.js";

/** @param {string} name @param {Partial<any>} [extra] */
const actor = (name, extra = {}) => ({
  id: name,
  name,
  type: "character",
  hasPlayerOwner: true,
  ...extra,
});

describe("selectParty", () => {
  it("is every player-owned character, sorted by name", () => {
    const actors = [actor("Zed"), actor("Ann"), actor("Mo")];
    expect(selectParty(actors).map((a) => a.name)).toEqual(["Ann", "Mo", "Zed"]);
  });

  it("leaves out characters no player owns (e.g. GM test characters)", () => {
    expect(selectParty([actor("Ann"), actor("Bob", { hasPlayerOwner: false })])).toHaveLength(1);
  });

  it("leaves out NPCs and other actor types", () => {
    expect(selectParty([actor("Ann"), actor("Wolf", { type: "npc" })])).toHaveLength(1);
  });

  it("accepts any iterable, like Foundry's actor collection", () => {
    expect(selectParty(new Set([actor("Ann")]))).toHaveLength(1);
  });
});
