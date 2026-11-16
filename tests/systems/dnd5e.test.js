import { describe, expect, it } from "vitest";
import { dnd5eAdapter } from "../../scripts/systems/dnd5e.js";
import { DEFAULT_FATE_RULES, resolveFateReroll } from "../../scripts/rules/fateReroll.js";
import { editFirstRoll, firstRoll, loadMessage } from "../helpers/fixtures.js";

const load = (/** @type {string} */ name) => loadMessage("dnd5e", name);
const info = (/** @type {string} */ name) => dnd5eAdapter.getRollInfo(load(name));

/** Set a message's d20 results and keep its total consistent. */
function withDice(
  /** @type {any} */ message,
  /** @type {{ result: number, active: boolean, discarded?: boolean, rerolled?: boolean }[]} */ results,
) {
  return editFirstRoll(message, (roll) => {
    const die = roll.terms[0];
    const oldKept = die.results.find((/** @type {any} */ r) => r.active).result;
    const newKept = results.find((r) => r.active)?.result ?? 0;
    die.results = results;
    roll.total = roll.total - oldKept + newKept;
  });
}

describe("dnd5e getRollInfo: recorded messages", () => {
  it.each([
    ["attack-normal", "attack", "normal"],
    ["attack-advantage", "attack", "advantage"],
    ["attack-disadvantage", "attack", "disadvantage"],
    ["save", "save", "normal"],
    ["ability-check", "ability", "normal"],
    ["skill", "skill", "normal"],
    ["skill-disadvantage", "skill", "disadvantage"],
    ["tool", "tool", "normal"],
    ["death-save", "death", "normal"],
    ["initiative", "initiative", "normal"],
  ])("reads %s as a %s roll (%s)", (name, kind, mode) => {
    const result = info(name);
    expect(result).toMatchObject({ kind, mode });
  });

  it("reads every original d20 and the one that was kept", () => {
    // Recorded: disadvantage, rolled 1 and 15, kept the 1.
    expect(info("attack-disadvantage")).toMatchObject({ dice: [1, 15], keptNatural: 1 });
    // Recorded: advantage, rolled 17 and 10, kept the 17.
    expect(info("attack-advantage")).toMatchObject({ dice: [17, 10], keptNatural: 17 });
  });

  it("works out the modifier as total minus the kept die", () => {
    const message = load("skill");
    const roll = firstRoll(message);
    const kept = roll.terms[0].results[0].result;
    expect(dnd5eAdapter.getRollInfo(message)).toMatchObject({
      total: roll.total,
      modifier: roll.total - kept,
    });
  });

  it("reads the crit threshold from the die", () => {
    expect(info("attack-normal")?.critThreshold).toBe(20);
    const champion = editFirstRoll(load("attack-normal"), (roll) => {
      roll.terms[0].options.criticalSuccess = 19;
    });
    expect(dnd5eAdapter.getRollInfo(champion)?.critThreshold).toBe(19);
  });

  it("defaults the crit threshold to 20 when the roll doesn't say (initiative)", () => {
    expect(info("initiative")?.critThreshold).toBe(20);
  });

  it("reads a roll's target (a death save's DC of 10), or null when there is none", () => {
    expect(info("death-save")?.target).toBe(10);
    expect(info("skill")?.target).toBeNull();
  });

  it("reads the speaking actor", () => {
    const message = load("save");
    expect(dnd5eAdapter.getRollInfo(message)?.actorId).toBe(message.speaker.actor);
  });

  it("ignores damage rolls", () => {
    expect(info("damage")).toBeNull();
  });
});

describe("dnd5e getRollInfo: edge cases", () => {
  it("ignores messages without rolls", () => {
    expect(dnd5eAdapter.getRollInfo({ ...load("skill"), rolls: [] })).toBeNull();
  });

  it("ignores rolls that don't start with a d20", () => {
    const message = editFirstRoll(load("skill"), (roll) => {
      roll.terms[0].faces = 12;
    });
    expect(dnd5eAdapter.getRollInfo(message)).toBeNull();
  });

  it("ignores unevaluated rolls", () => {
    const message = editFirstRoll(load("skill"), (roll) => {
      roll.evaluated = false;
    });
    expect(dnd5eAdapter.getRollInfo(message)).toBeNull();
  });

  it("ignores messages with no speaking actor", () => {
    const message = load("skill");
    message.speaker.actor = null;
    expect(dnd5eAdapter.getRollInfo(message)).toBeNull();
  });

  it("handles Elven Accuracy (three advantage dice)", () => {
    const message = withDice(load("attack-advantage"), [
      { result: 4, active: false, discarded: true },
      { result: 12, active: true },
      { result: 7, active: false, discarded: true },
    ]);
    expect(dnd5eAdapter.getRollInfo(message)).toMatchObject({
      mode: "advantage",
      dice: [4, 12, 7],
      keptNatural: 12,
    });
  });

  it("ignores a die replaced by Halfling Lucky, using its reroll", () => {
    const message = withDice(load("skill"), [
      { result: 1, active: false, rerolled: true },
      { result: 8, active: true },
    ]);
    expect(dnd5eAdapter.getRollInfo(message)).toMatchObject({
      mode: "normal",
      dice: [8],
      keptNatural: 8,
    });
  });
});

describe("dnd5e buildFatedRoll", () => {
  const rules = DEFAULT_FATE_RULES;

  /** Resolve a fate reroll for a fixture and build the new roll from it. */
  function fate(/** @type {any} */ message, /** @type {number} */ fateDie, ruleOverrides = {}) {
    const rollInfo = /** @type {NonNullable<ReturnType<typeof dnd5eAdapter.getRollInfo>>} */ (
      dnd5eAdapter.getRollInfo(message)
    );
    const outcome = resolveFateReroll({
      dice: rollInfo.dice,
      mode: rollInfo.mode,
      fateDie,
      rules: { ...rules, ...ruleOverrides },
      critThreshold: rollInfo.critThreshold,
    });
    const roll = dnd5eAdapter.buildFatedRoll(firstRoll(message), rollInfo, outcome);
    return { rollInfo, outcome, roll };
  }

  it("keeps a boosted fate die: new total, bonus as its own term, originals discarded", () => {
    // Disadvantage 1/15, fate 7 → 17 beats the lower die (1).
    const { rollInfo, roll } = fate(load("attack-disadvantage"), 7);
    const die = roll.terms[0];
    expect(die.results).toEqual([
      { result: 1, active: false, discarded: true },
      { result: 15, active: false, discarded: true },
      { result: 7, active: true, fate: true },
    ]);
    expect(roll.terms.slice(-2)).toEqual([
      { class: "OperatorTerm", options: {}, evaluated: true, operator: "+" },
      { class: "NumericTerm", options: { flavor: "Fate" }, evaluated: true, number: 10 },
    ]);
    expect(roll.total).toBe(rollInfo.modifier + 17);
    expect(roll.formula).toBe(`${firstRoll(load("attack-disadvantage")).formula} + 10[Fate]`);
  });

  it("stops a boosted fate die from counting as a crit or fumble", () => {
    // Fate die 1 → 11. dnd5e would call the d20 a natural 1 without this.
    const { roll } = fate(load("attack-disadvantage"), 1);
    expect(roll.terms[0].options).toMatchObject({ criticalSuccess: null, criticalFailure: null });
    expect(roll.options).toMatchObject({ criticalSuccess: null, criticalFailure: null });
  });

  it("keeps crit and fumble ranges for an unboosted fate die", () => {
    const { roll } = fate(load("attack-disadvantage"), 20);
    expect(roll.terms[0].options).toMatchObject({ criticalSuccess: 20, criticalFailure: 1 });
    expect(roll.terms).toHaveLength(firstRoll(load("attack-disadvantage")).terms.length);
  });

  it("keeps the original die when it wins, recording the fate die as discarded", () => {
    // Advantage 17/10, fate 3 → 13 loses to 17.
    const original = firstRoll(load("attack-advantage"));
    const { roll } = fate(load("attack-advantage"), 3);
    expect(roll.total).toBe(original.total);
    expect(roll.terms[0].results).toEqual([
      ...original.terms[0].results,
      { result: 3, active: false, discarded: true, fate: true },
    ]);
    expect(roll.terms).toHaveLength(original.terms.length);
    expect(roll.formula).toBe(original.formula);
  });

  it("does not add a bonus term when the bonus rule is off", () => {
    const { roll, rollInfo } = fate(load("skill"), 3, { bonusEnabled: false });
    expect(roll.formula).not.toContain("[Fate]");
    expect(roll.total).toBe(Math.max(rollInfo.keptNatural, 3) + rollInfo.modifier);
  });

  it("records the fate outcome in the roll options", () => {
    const { roll, outcome } = fate(load("attack-disadvantage"), 7);
    expect(roll.options.fateDice).toEqual(outcome);
  });

  it("does not modify the roll data passed in", () => {
    const message = load("attack-disadvantage");
    const before = firstRoll(message);
    const rollInfo = /** @type {any} */ (dnd5eAdapter.getRollInfo(message));
    const outcome = resolveFateReroll({ ...rollInfo, fateDie: 7, rules });
    const input = firstRoll(message);
    dnd5eAdapter.buildFatedRoll(input, rollInfo, outcome);
    expect(input).toEqual(before);
  });
});

describe("dnd5e 6 (Foundry v14) messages", () => {
  const load6 = (/** @type {string} */ name) => loadMessage("dnd5e6", name);
  const info6 = (/** @type {string} */ name) => dnd5eAdapter.getRollInfo(load6(name));

  it.each([
    ["attack-normal", "attack", "normal"],
    ["attack-advantage", "attack", "advantage"],
    ["attack-disadvantage", "attack", "disadvantage"],
    ["save", "save", "normal"],
    ["ability-check", "ability", "normal"],
    ["skill", "skill", "normal"],
    ["skill-disadvantage", "skill", "disadvantage"],
    ["tool", "tool", "normal"],
    ["death-save", "death", "normal"],
    ["initiative", "initiative", "normal"],
  ])("reads %s as a %s roll (%s)", (name, kind, mode) => {
    expect(info6(name)).toMatchObject({ kind, mode });
  });

  it("reads the dice and the kept die", () => {
    const message = load6("attack-disadvantage");
    const results = firstRoll(message).terms[0].results.map((/** @type {any} */ r) => r.result);
    expect(info6("attack-disadvantage")).toMatchObject({
      dice: results,
      keptNatural: Math.min(...results),
    });
  });

  it("ignores damage rolls", () => {
    expect(info6("damage")).toBeNull();
  });
});
