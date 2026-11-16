import { describe, expect, it } from "vitest";
import { pf1Adapter } from "../../scripts/systems/pf1.js";
import { DEFAULT_FATE_RULES, resolveFateReroll } from "../../scripts/rules/fateReroll.js";
import { editFirstRoll, firstRoll, loadMessage } from "../helpers/fixtures.js";

const load = (/** @type {string} */ name) => loadMessage("pf1", name);
const info = (/** @type {string} */ name) => pf1Adapter.getRollInfo(load(name));

describe("pf1 getRollInfo", () => {
  it.each([
    ["skill", "skill"],
    ["save", "save"],
    ["ability-check", "ability"],
    ["initiative", "initiative"],
  ])("reads %s as a %s roll", (name, kind) => {
    expect(info(name)).toMatchObject({ kind, mode: "normal" });
  });

  it("ignores rolls that aren't pf1's d20 rolls (e.g. a plain damage roll)", () => {
    const message = editFirstRoll(load("skill"), (roll) => {
      roll.class = "RollPF";
    });
    expect(pf1Adapter.getRollInfo(message)).toBeNull();
  });

  it("gives attack cards no Fate Reroll (yet)", () => {
    expect(info("attack-card")).toBeNull();
  });

  it("reads the crit threshold from the roll", () => {
    expect(info("skill")?.critThreshold).toBe(20);
  });

  it("works out the modifier, including initiative's tiebreaker", () => {
    const message = load("initiative");
    const roll = firstRoll(message);
    expect(pf1Adapter.getRollInfo(message)?.modifier).toBe(
      roll.total - roll.terms[0].results[0].result,
    );
  });
});

describe("pf1 buildFatedRoll", () => {
  it("adds the fate die and bonus term and recomputes the total", () => {
    const message = load("save");
    const rollInfo = /** @type {any} */ (pf1Adapter.getRollInfo(message));
    // Fate 9 with the default rules is 19, which beats any recorded die.
    const outcome = resolveFateReroll({ ...rollInfo, fateDie: 9, rules: DEFAULT_FATE_RULES });
    const rollData = pf1Adapter.buildFatedRoll(firstRoll(message), rollInfo, outcome);
    expect(rollData.total).toBe(rollInfo.modifier + 19);
    expect(rollData.formula).toContain("+ 10[Fate]");
    expect(rollData.terms[0].results.at(-1)).toEqual({ result: 9, active: true, fate: true });
  });
});
