import { describe, expect, it } from "vitest";
import {
  DEFAULT_FATE_RULES,
  applyFateBonus,
  resolveFateReroll,
  validateFateRules,
} from "../../scripts/rules/fateReroll.js";

const rules = DEFAULT_FATE_RULES;

/** @param {Partial<import("../../scripts/rules/fateReroll.js").FateRerollInput>} input */
const resolve = (input) =>
  resolveFateReroll({ dice: [10], mode: "normal", fateDie: 10, rules, ...input });

describe("DEFAULT_FATE_RULES", () => {
  it("is +10 on a fate die of 9 or lower, enabled", () => {
    expect(DEFAULT_FATE_RULES).toEqual({ bonusEnabled: true, threshold: 9, bonus: 10 });
  });

  it("is frozen so callers cannot mutate the defaults", () => {
    expect(Object.isFrozen(DEFAULT_FATE_RULES)).toBe(true);
  });
});

describe("applyFateBonus", () => {
  it.each([
    [3, 13],
    [9, 19],
    [1, 11],
  ])("adds the bonus to a fate die at or below the threshold (%i → %i)", (die, value) => {
    expect(applyFateBonus(die, rules)).toEqual({ natural: die, bonus: 10, value });
  });

  it.each([10, 15, 20])("leaves a fate die above the threshold alone (%i)", (die) => {
    expect(applyFateBonus(die, rules)).toEqual({ natural: die, bonus: 0, value: die });
  });

  it("adds nothing when the bonus rule is disabled", () => {
    expect(applyFateBonus(3, { ...rules, bonusEnabled: false })).toEqual({
      natural: 3,
      bonus: 0,
      value: 3,
    });
  });

  it("supports a custom bonus and threshold (+5 on 5 or lower)", () => {
    const custom = { bonusEnabled: true, threshold: 5, bonus: 5 };
    expect(applyFateBonus(5, custom).value).toBe(10);
    expect(applyFateBonus(1, custom).value).toBe(6);
    expect(applyFateBonus(6, custom).value).toBe(6);
  });

  it("allows a boosted value above 20", () => {
    expect(applyFateBonus(9, { bonusEnabled: true, threshold: 9, bonus: 15 }).value).toBe(24);
  });
});

describe("resolveFateReroll: normal rolls", () => {
  it("keeps a boosted fate die that beats the original (8 vs 4→14)", () => {
    const r = resolve({ dice: [8], fateDie: 4 });
    expect(r.kept).toBe("fate");
    expect(r.result).toEqual({ natural: 4, bonus: 10, value: 14 });
    expect(r.against).toEqual({ natural: 8, value: 8 });
  });

  it("keeps the original when it beats the fate die (15 vs 2→12)", () => {
    const r = resolve({ dice: [15], fateDie: 2 });
    expect(r.kept).toBe("original");
    expect(r.result).toEqual({ natural: 15, bonus: 0, value: 15 });
    expect(r.fate).toEqual({ natural: 2, bonus: 10, value: 12 });
  });

  it("keeps the original on a tie", () => {
    const r = resolve({ dice: [15], fateDie: 5 });
    expect(r.kept).toBe("original");
    expect(r.result.value).toBe(15);
  });
});

describe("resolveFateReroll: advantage", () => {
  it("compares against the higher original die (6/9 vs 5→15)", () => {
    const r = resolve({ dice: [6, 9], mode: "advantage", fateDie: 5 });
    expect(r.against.natural).toBe(9);
    expect(r.kept).toBe("fate");
    expect(r.result.value).toBe(15);
  });

  it("keeps the higher original when it wins (18/4 vs 3→13)", () => {
    const r = resolve({ dice: [18, 4], mode: "advantage", fateDie: 3 });
    expect(r.kept).toBe("original");
    expect(r.result.value).toBe(18);
  });

  it("handles more than two advantage dice (e.g. Elven Accuracy)", () => {
    const r = resolve({ dice: [4, 7, 12], mode: "advantage", fateDie: 6 });
    expect(r.against.natural).toBe(12);
    expect(r.result.value).toBe(16);
  });
});

describe("resolveFateReroll: disadvantage", () => {
  it("compares only against the lower die (19/3 vs 7→17)", () => {
    const r = resolve({ dice: [19, 3], mode: "disadvantage", fateDie: 7 });
    expect(r.against.natural).toBe(3);
    expect(r.kept).toBe("fate");
    expect(r.result.value).toBe(17);
  });

  it("never keeps the higher original die (19/3 vs 10)", () => {
    const r = resolve({ dice: [19, 3], mode: "disadvantage", fateDie: 10 });
    expect(r.kept).toBe("fate");
    expect(r.result.value).toBe(10);
  });

  it("turns a fate 1 into 11 against the lower die (19/3 vs 1→11)", () => {
    const r = resolve({ dice: [19, 3], mode: "disadvantage", fateDie: 1 });
    expect(r.result).toEqual({ natural: 1, bonus: 10, value: 11 });
  });

  it("keeps the lower original on a tie (19/12 vs 2→12)", () => {
    const r = resolve({ dice: [19, 12], mode: "disadvantage", fateDie: 2 });
    expect(r.kept).toBe("original");
    expect(r.result.value).toBe(12);
  });

  it("does not depend on die order", () => {
    const r = resolve({ dice: [3, 19], mode: "disadvantage", fateDie: 7 });
    expect(r.against.natural).toBe(3);
  });
});

describe("resolveFateReroll: criticals", () => {
  it("a kept natural 20 on the original is a crit", () => {
    expect(resolve({ dice: [20], fateDie: 4 }).isCritical).toBe(true);
  });

  it("a kept natural 20 on the fate die is a crit", () => {
    const r = resolve({ dice: [5], fateDie: 20 });
    expect(r.kept).toBe("fate");
    expect(r.isCritical).toBe(true);
  });

  it("a boosted fate die never crits, even with an expanded crit range", () => {
    const r = resolve({ dice: [5], fateDie: 9, critThreshold: 19 });
    expect(r.result.value).toBe(19);
    expect(r.isCritical).toBe(false);
  });

  it("a boosted fate die above 20 is not a crit", () => {
    const r = resolve({ dice: [5], fateDie: 9, rules: { ...rules, bonus: 15 } });
    expect(r.result.value).toBe(24);
    expect(r.isCritical).toBe(false);
  });

  it("respects an expanded crit range for natural dice", () => {
    expect(resolve({ dice: [19], fateDie: 2, critThreshold: 19 }).isCritical).toBe(true);
    expect(resolve({ dice: [2], fateDie: 19, critThreshold: 19 }).isCritical).toBe(true);
  });

  it("a non-crit result is not a crit", () => {
    expect(resolve({ dice: [8], fateDie: 4 }).isCritical).toBe(false);
  });
});

describe("resolveFateReroll: fumbles", () => {
  it("a fate 1 with the bonus on becomes 11 and is not a fumble", () => {
    const r = resolve({ dice: [1], fateDie: 1 });
    expect(r.result.value).toBe(11);
    expect(r.isFumble).toBe(false);
  });

  it("an original 1 is kept (and fumbles) only if the fate die also shows 1 with no bonus", () => {
    const r = resolve({ dice: [1], fateDie: 1, rules: { ...rules, bonusEnabled: false } });
    expect(r.kept).toBe("original");
    expect(r.isFumble).toBe(true);
  });

  it("any other result is not a fumble", () => {
    expect(resolve({ dice: [1], fateDie: 12 }).isFumble).toBe(false);
  });
});

describe("resolveFateReroll: input validation", () => {
  it.each([
    ["normal with two dice", { dice: [4, 5], mode: "normal" }],
    ["advantage with one die", { dice: [4], mode: "advantage" }],
    ["disadvantage with one die", { dice: [4], mode: "disadvantage" }],
    ["no dice", { dice: [] }],
    ["a die above 20", { dice: [21] }],
    ["a die below 1", { dice: [0] }],
    ["a fractional die", { dice: [4.5] }],
    ["a fate die of 0", { fateDie: 0 }],
    ["a fate die of 21", { fateDie: 21 }],
    ["an unknown mode", { mode: "sideways" }],
    ["invalid rules", { rules: { ...rules, threshold: 20 } }],
    ["a crit threshold of 0", { critThreshold: 0 }],
  ])("rejects %s", (_label, input) => {
    // @ts-expect-error deliberately invalid input
    expect(() => resolve(input)).toThrow(RangeError);
  });
});

describe("validateFateRules", () => {
  it("accepts the defaults", () => {
    expect(validateFateRules(DEFAULT_FATE_RULES)).toEqual([]);
  });

  it("accepts any threshold from 1 to 19", () => {
    expect(validateFateRules({ ...rules, threshold: 1 })).toEqual([]);
    expect(validateFateRules({ ...rules, threshold: 19 })).toEqual([]);
  });

  it.each([0, 20, 4.5, NaN])("rejects threshold %s", (threshold) => {
    expect(validateFateRules({ ...rules, threshold })).toEqual([
      "threshold must be a whole number from 1 to 19",
    ]);
  });

  it.each([0, -5, 2.5, 101])("rejects bonus %s", (bonus) => {
    expect(validateFateRules({ ...rules, bonus })).toEqual([
      "bonus must be a whole number from 1 to 100",
    ]);
  });

  it("rejects a non-boolean bonusEnabled", () => {
    // @ts-expect-error deliberately invalid input
    expect(validateFateRules({ ...rules, bonusEnabled: "yes" })).toEqual([
      "bonusEnabled must be true or false",
    ]);
  });

  it("reports every problem at once", () => {
    expect(validateFateRules({ bonusEnabled: true, threshold: 0, bonus: 0 })).toHaveLength(2);
  });
});
