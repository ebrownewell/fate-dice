import { describe, expect, it } from "vitest";
import { removeHeroPointReroll } from "../../scripts/systems/pf2eMenu.js";

describe("removeHeroPointReroll", () => {
  it("removes pf2e's hero point reroll entry, in place, keeping the rest", () => {
    const options = [
      { name: "PF2E.DamageButton.HealingContext" },
      { name: "PF2E.RerollMenu.HeroPoint" },
      { name: "PF2E.RerollMenu.KeepNew" },
    ];
    removeHeroPointReroll(options);
    expect(options.map((o) => o.name)).toEqual([
      "PF2E.DamageButton.HealingContext",
      "PF2E.RerollMenu.KeepNew",
    ]);
  });

  it("also works with Foundry v14 menu entries, which use label instead of name", () => {
    const options = [{ label: "PF2E.RerollMenu.HeroPoint" }, { label: "PF2E.RerollMenu.KeepNew" }];
    removeHeroPointReroll(options);
    expect(options.map((o) => o.label)).toEqual(["PF2E.RerollMenu.KeepNew"]);
  });

  it("does nothing when the entry isn't there", () => {
    const options = [{ name: "A" }];
    removeHeroPointReroll(options);
    expect(options).toEqual([{ name: "A" }]);
  });
});
