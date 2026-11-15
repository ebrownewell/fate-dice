import { describe, expect, it } from "vitest";
import {
  checkFateable,
  getButtonState,
  getFateFlags,
} from "../../scripts/core/fateRerollPolicy.js";
import { MODULE_ID } from "../../scripts/core/constants.js";

const settings = {
  rerollEnabled: true,
  rerollCost: 1,
  rerollOnInitiative: true,
  rerollOnDeathSaves: true,
};

/** @param {string} kind */
const rollInfo = (kind) => ({ kind });

describe("getFateFlags", () => {
  it("reads the module's flags from message data", () => {
    expect(getFateFlags({ flags: { [MODULE_ID]: { fatedBy: "m2" } } })).toEqual({ fatedBy: "m2" });
  });

  it("is empty when there are none", () => {
    expect(getFateFlags({ flags: {} })).toEqual({});
    expect(getFateFlags({})).toEqual({});
  });
});

describe("checkFateable", () => {
  const check = (/** @type {any} */ overrides) =>
    checkFateable({ info: rollInfo("skill"), flags: {}, settings, ...overrides });

  it("allows an ordinary d20 roll", () => {
    expect(check({})).toEqual({ ok: true });
  });

  it("refuses when Fate Reroll is disabled", () => {
    expect(check({ settings: { ...settings, rerollEnabled: false } })).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  it("refuses anything that isn't a d20 roll", () => {
    expect(check({ info: null })).toEqual({ ok: false, reason: "not-d20" });
  });

  it("refuses a roll that was already fated", () => {
    expect(check({ flags: { fatedBy: "m2" } })).toEqual({ ok: false, reason: "already-fated" });
  });

  it("refuses to fate a Fate Reroll's own result", () => {
    expect(check({ flags: { fatedFrom: "m1" } })).toEqual({ ok: false, reason: "is-fate-result" });
  });

  it("respects the initiative setting", () => {
    expect(check({ info: rollInfo("initiative") })).toEqual({ ok: true });
    expect(
      check({
        info: rollInfo("initiative"),
        settings: { ...settings, rerollOnInitiative: false },
      }),
    ).toEqual({ ok: false, reason: "initiative-disabled" });
  });

  it("refuses death saves for now (support is coming in a later step)", () => {
    expect(check({ info: rollInfo("death") })).toEqual({
      ok: false,
      reason: "death-unsupported",
    });
  });
});

describe("getButtonState", () => {
  const state = (/** @type {any} */ overrides) =>
    getButtonState({ check: { ok: true }, isOwner: true, points: 2, cost: 1, ...overrides });

  it("shows an enabled button to the owner of a fateable roll", () => {
    expect(state({})).toEqual({ visible: true, enabled: true });
  });

  it("hides the button from anyone who doesn't own the character", () => {
    expect(state({ isOwner: false })).toEqual({ visible: false });
  });

  it("hides the button on rolls that can't be fated", () => {
    expect(state({ check: { ok: false, reason: "not-d20" } })).toEqual({ visible: false });
  });

  it("shows a disabled button, with the reason, when the character can't afford it", () => {
    expect(state({ points: 0 })).toEqual({
      visible: true,
      enabled: false,
      reason: "insufficient-points",
    });
  });

  it("shows a 'fated' marker instead of a button on a roll that was already fated", () => {
    expect(state({ check: { ok: false, reason: "already-fated" } })).toEqual({
      visible: false,
      fated: true,
    });
  });
});
