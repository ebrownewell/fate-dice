import { describe, expect, it } from "vitest";
import {
  DEATH_SAVE_CHAT_KEYS,
  deathStateAfter,
  planFatedDeathSave,
  resolveDeathSave,
  snapshotDeathState,
} from "../../scripts/rules/deathSave.js";

const roll = (/** @type {number} */ total, { isCritical = false, isFumble = false } = {}) => ({
  total,
  isCritical,
  isFumble,
});
const state = (/** @type {number} */ success, /** @type {number} */ failure, hp = 0) => ({
  success,
  failure,
  hp,
});

describe("resolveDeathSave (mirrors dnd5e 5.3.3)", () => {
  it("a total of 10 or more adds a success", () => {
    expect(resolveDeathSave(state(0, 1), roll(10))).toEqual({
      success: 1,
      failure: 1,
      revived: false,
      outcome: "success",
    });
  });

  it("a third success stabilises and resets both counts", () => {
    expect(resolveDeathSave(state(2, 2), roll(14))).toEqual({
      success: 0,
      failure: 0,
      revived: false,
      outcome: "stable",
    });
  });

  it("a critical success revives with 1 HP and resets both counts", () => {
    expect(resolveDeathSave(state(1, 2), roll(20, { isCritical: true }))).toEqual({
      success: 0,
      failure: 0,
      revived: true,
      outcome: "revived",
    });
  });

  it("below 10 adds a failure", () => {
    expect(resolveDeathSave(state(1, 0), roll(9))).toMatchObject({
      success: 1,
      failure: 1,
      outcome: "failure",
    });
  });

  it("a fumble adds two failures", () => {
    expect(resolveDeathSave(state(0, 0), roll(1, { isFumble: true }))).toMatchObject({
      failure: 2,
      outcome: "failure",
    });
  });

  it("a third failure is death, and failures never exceed 3", () => {
    expect(resolveDeathSave(state(0, 2), roll(1, { isFumble: true }))).toMatchObject({
      failure: 3,
      outcome: "dead",
    });
  });

  it("uses a custom target when the roll has one", () => {
    expect(resolveDeathSave(state(0, 0), roll(12), 15).outcome).toBe("failure");
  });
});

describe("deathStateAfter", () => {
  it("is the character's state after a roll, from the snapshot before it", () => {
    expect(deathStateAfter(state(1, 1, 0), roll(5))).toEqual(state(1, 2, 0));
    expect(deathStateAfter(state(1, 1, 0), roll(20, { isCritical: true }))).toEqual(state(0, 0, 1));
  });
});

describe("snapshotDeathState", () => {
  it("reads the death-save counts and HP from dnd5e actor attributes", () => {
    const attributes = { death: { success: 1, failure: 2, roll: {} }, hp: { value: 0, max: 30 } };
    expect(snapshotDeathState(attributes)).toEqual(state(1, 2, 0));
  });

  it("treats missing counts as 0", () => {
    expect(snapshotDeathState({ death: {}, hp: { value: 0 } })).toEqual(state(0, 0, 0));
  });
});

describe("planFatedDeathSave", () => {
  const before = state(1, 1, 0);

  it("refuses if the character changed since the original roll", () => {
    // Original 5 → expected 1 success / 2 failures, but now shows 0 / 0 (healed).
    expect(
      planFatedDeathSave({ before, current: state(0, 0, 5), original: roll(5), fated: roll(15) }),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("replaces the original's effect with the fated roll's", () => {
    // Original 5 = failure (1/2). Fated 15 = success (2/1).
    expect(
      planFatedDeathSave({
        before,
        current: state(1, 2, 0),
        original: roll(5),
        fated: roll(15),
      }),
    ).toEqual({
      ok: true,
      updates: {
        "system.attributes.death.success": 2,
        "system.attributes.death.failure": 1,
      },
      chatKey: null,
    });
  });

  it("undoes a death when the fated roll succeeds, and says so", () => {
    const dying = state(2, 2, 0);
    expect(
      planFatedDeathSave({
        before: dying,
        current: state(2, 3, 0),
        original: roll(4),
        fated: roll(16),
      }),
    ).toEqual({
      ok: true,
      updates: {
        "system.attributes.death.success": 0,
        "system.attributes.death.failure": 0,
      },
      chatKey: DEATH_SAVE_CHAT_KEYS.stable,
    });
  });

  it("revives on a fated natural 20", () => {
    expect(
      planFatedDeathSave({
        before,
        current: state(1, 2, 0),
        original: roll(5),
        fated: roll(20, { isCritical: true }),
      }),
    ).toEqual({
      ok: true,
      updates: {
        "system.attributes.death.success": 0,
        "system.attributes.death.failure": 0,
        "system.attributes.hp.value": 1,
      },
      chatKey: DEATH_SAVE_CHAT_KEYS.revived,
    });
  });

  it("changes nothing when the outcome is the same", () => {
    expect(
      planFatedDeathSave({
        before,
        current: state(1, 2, 0),
        original: roll(5),
        fated: roll(7),
      }),
    ).toEqual({ ok: true, updates: {}, chatKey: null });
  });
});
