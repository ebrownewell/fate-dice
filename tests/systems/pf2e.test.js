import { describe, expect, it } from "vitest";
import { pf2eAdapter } from "../../scripts/systems/pf2e.js";
import { DEFAULT_FATE_RULES, resolveFateReroll } from "../../scripts/rules/fateReroll.js";
import { firstRoll, loadMessage } from "../helpers/fixtures.js";
import { rewriteDegreeHtml } from "../../scripts/rules/pf2eDegree.js";

const load = (/** @type {string} */ name) => loadMessage("pf2e", name);
const info = (/** @type {string} */ name) => pf2eAdapter.getRollInfo(load(name));

/** Fate a recorded message with a given fate die. */
function fate(/** @type {string} */ name, /** @type {number} */ fateDie) {
  const message = load(name);
  const rollInfo = /** @type {any} */ (pf2eAdapter.getRollInfo(message));
  const outcome = resolveFateReroll({ ...rollInfo, fateDie, rules: DEFAULT_FATE_RULES });
  const rollData = pf2eAdapter.buildFatedRoll(firstRoll(message), rollInfo, outcome);
  return { message, rollInfo, outcome, rollData };
}

describe("pf2e getRollInfo", () => {
  it.each([
    ["skill-dc", "skill", "normal"],
    ["skill", "skill", "normal"],
    ["skill-fortune", "skill", "advantage"],
    ["skill-misfortune", "skill", "disadvantage"],
    ["save", "save", "normal"],
    ["perception", "perception", "normal"],
    ["strike", "attack", "normal"],
    ["initiative", "initiative", "normal"],
  ])("reads %s as a %s roll (%s)", (name, kind, mode) => {
    expect(info(name)).toMatchObject({ kind, mode });
  });

  it("treats fortune and misfortune as advantage and disadvantage", () => {
    // Recorded: fortune 12/12; misfortune 8/12, keeping the 8.
    expect(info("skill-fortune")).toMatchObject({ dice: [12, 12], keptNatural: 12 });
    expect(info("skill-misfortune")).toMatchObject({ dice: [8, 12], keptNatural: 8 });
  });

  it("reads the DC when the roll had one", () => {
    expect(info("skill-dc")?.dc).toBe(15);
    expect(info("skill")?.dc).toBeNull();
  });

  it("ignores damage rolls", () => {
    expect(info("damage")).toBeNull();
  });

  it("ignores rolls whose degree of success was adjusted by an ability (it can't be recomputed safely)", () => {
    const message = load("skill-dc");
    message.flags.pf2e.context.dosAdjustments = { all: { label: "Juggernaut" } };
    expect(pf2eAdapter.getRollInfo(message)).toBeNull();
  });
});

describe("pf2e buildFatedRoll", () => {
  it("adds the fate die and bonus, and recomputes the degree of success", () => {
    // Recorded skill-dc: natural 2 vs DC 15. Fate 7 → 17: success.
    const { rollData, rollInfo } = fate("skill-dc", 7);
    expect(rollData.total).toBe(rollInfo.modifier + 17);
    expect(rollData.options.degreeOfSuccess).toBe(2);
    expect(rollData.formula).toContain("+ 10[Fate]");
    expect(rollData.options.isReroll).toBe(true);
  });

  it("a natural 20 on the fate die steps the degree up", () => {
    const { rollData } = fate("skill-dc", 20); // 20 vs 15: success, nat 20 → critical success
    expect(rollData.options.degreeOfSuccess).toBe(3);
  });

  it("leaves the degree unset when the roll had no DC", () => {
    expect(fate("skill", 5).rollData.options.degreeOfSuccess).toBeUndefined();
  });
});

describe("pf2e adjustFatedMessage", () => {
  const localize = (/** @type {string} */ key) =>
    ({
      "PF2E.Check.Result.Degree.Check.success": "Success",
      "PF2E.Check.Result.Degree.Check.criticalSuccess": "Critical Success",
      "PF2E.Check.Result.Degree.Check.failure": "Failure",
      "PF2E.Check.Result.Degree.Check.criticalFailure": "Critical Failure",
    })[key] ?? key;

  it("updates the outcome pf2e stores and shows on the card", () => {
    const { message, rollInfo, outcome, rollData } = fate("skill-dc", 7);
    const data = pf2eAdapter.adjustFatedMessage(structuredClone(message), {
      info: rollInfo,
      outcome,
      rollData,
      localize,
    });
    expect(data.flags.pf2e.context.outcome).toBe("success");
    expect(data.flags.pf2e.context.unadjustedOutcome).toBe("success");
    expect(data.flags.pf2e.context.isReroll).toBe(true);
    expect(data.flavor).toContain('<span class="success">Success</span>');
    expect(data.flavor).toContain(`by +${rollData.total - 15}`);
  });

  it("changes nothing about the outcome when there was no DC", () => {
    const { message, rollInfo, outcome, rollData } = fate("skill", 5);
    const data = pf2eAdapter.adjustFatedMessage(structuredClone(message), {
      info: rollInfo,
      outcome,
      rollData,
      localize,
    });
    expect(data.flags.pf2e.context.outcome).toBe(message.flags.pf2e.context.outcome);
    expect(data.flavor).toBe(message.flavor);
  });
});

describe("pf2e 8 (Foundry v14) messages", () => {
  const info8 = (/** @type {string} */ name) => pf2eAdapter.getRollInfo(loadMessage("pf2e8", name));

  it.each([
    ["skill-dc", "skill", "normal"],
    ["skill-fortune", "skill", "advantage"],
    ["skill-misfortune", "skill", "disadvantage"],
    ["save", "save", "normal"],
    ["perception", "perception", "normal"],
    ["strike", "attack", "normal"],
    ["initiative", "initiative", "normal"],
  ])("reads %s as a %s roll (%s)", (name, kind, mode) => {
    expect(info8(name)).toMatchObject({ kind, mode });
  });

  it("reads the DC and ignores damage", () => {
    expect(info8("skill-dc")?.dc).toBe(15);
    expect(info8("damage")).toBeNull();
  });

  it("finds the result line on a pf2e 8 card", () => {
    const flavor = loadMessage("pf2e8", "skill-dc").flavor;
    expect(rewriteDegreeHtml(flavor, { degree: 2, label: "Success", margin: 2 })).toContain(
      '<span class="success">Success</span>',
    );
  });
});
