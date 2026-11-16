import { describe, expect, it } from "vitest";
import { pf1Adapter, planAttackCrit } from "../../scripts/systems/pf1.js";
import { DEFAULT_FATE_RULES, resolveFateReroll } from "../../scripts/rules/fateReroll.js";
import { loadMessage } from "../helpers/fixtures.js";

const card = () => loadMessage("pf1", "attack-card"); // one attack: natural 20, crit range 19, confirmed with a 1
const fullAttack = () => loadMessage("pf1", "full-attack-card"); // two attacks

/** @param {Partial<any>} result */
const outcome = (result, kept = "fate") =>
  /** @type {any} */ ({
    fate: { natural: 10, bonus: 0, value: 10, ...result },
    against: { natural: 5, value: 5 },
    kept,
    result: { natural: 10, bonus: 0, value: 10, ...result },
    isCritical: false,
    isFumble: false,
  });

describe("pf1 attack targets", () => {
  it("offers each attack in a full attack as its own target", () => {
    const targets = pf1Adapter.getRollTargets(fullAttack());
    const attacks = fullAttack().system.rolls.attacks;
    expect(targets).toHaveLength(2);
    targets.forEach((t, i) => {
      expect(t.target).toBe(`attack-${i}`);
      expect(t.roll).toEqual(attacks[i].attack);
      expect(t.info).toMatchObject({
        kind: "attack",
        mode: "normal",
        total: attacks[i].attack.total,
      });
    });
  });

  it("reads each attack's crit range", () => {
    const [target] = pf1Adapter.getRollTargets(card());
    expect(target.info).toMatchObject({ critThreshold: 19, keptNatural: 20 });
  });

  it("still offers single checks as target '0'", () => {
    const [target] = pf1Adapter.getRollTargets(loadMessage("pf1", "skill"));
    expect(target.target).toBe("0");
  });

  it("puts each attack's button in that attack's row", () => {
    expect(pf1Adapter.controlAnchor("attack-1")).toBe('.chat-attack[data-index="1"]');
    expect(pf1Adapter.controlAnchor("0")).toBeNull();
  });
});

describe("planAttackCrit", () => {
  const attack = (/** @type {number} */ natural, confirm = false) => ({
    attack: { terms: [{ results: [{ result: natural, active: true }] }] },
    ...(confirm ? { critConfirm: {} } : {}),
  });

  it("says the original stands when the original die was kept", () => {
    expect(
      planAttackCrit({ attack: attack(12), outcome: outcome({}, "original"), critThreshold: 19 }),
    ).toMatchObject({
      status: "original",
    });
  });

  it("a fated natural threat on a non-threat is a new threat that needs confirming", () => {
    expect(
      planAttackCrit({
        attack: attack(5),
        outcome: outcome({ natural: 19, value: 19 }),
        critThreshold: 19,
      }),
    ).toEqual({
      status: "new",
      natural20: false,
      natural1: false,
    });
  });

  it("a boosted fate die never threatens, even when its face is in the crit range", () => {
    // Possible when the GM sets the bonus to apply on high rolls (e.g. 19 or lower).
    expect(
      planAttackCrit({
        attack: attack(5),
        outcome: outcome({ natural: 17, bonus: 10, value: 27 }),
        critThreshold: 17,
      }).status,
    ).toBe("none");
  });

  it("a boosted fate die below the crit range doesn't threaten either", () => {
    expect(
      planAttackCrit({
        attack: attack(5),
        outcome: outcome({ natural: 9, bonus: 10, value: 19 }),
        critThreshold: 19,
      }).status,
    ).toBe("none");
  });

  it("keeps an existing threat when the fated die also threatens", () => {
    expect(
      planAttackCrit({
        attack: attack(19, true),
        outcome: outcome({ natural: 20, value: 20 }),
        critThreshold: 19,
      }),
    ).toMatchObject({ status: "kept", natural20: true });
  });

  it("loses the threat when a wide crit range threat is beaten by a boosted die", () => {
    expect(
      planAttackCrit({
        attack: attack(15, true),
        outcome: outcome({ natural: 9, bonus: 10, value: 19 }),
        critThreshold: 15,
      }).status,
    ).toBe("lost");
  });
});

describe("pf1 extra dice for a fated attack", () => {
  it("asks for one d20 (the confirmation) only for a new threat", () => {
    const message = fullAttack();
    const [target] = pf1Adapter.getRollTargets(message);
    const args = { message, target: target.target, info: target.info };
    expect(pf1Adapter.extraD20s({ ...args, outcome: outcome({ natural: 20, value: 20 }) })).toBe(
      target.info.keptNatural >= target.info.critThreshold ? 0 : 1,
    );
    expect(
      pf1Adapter.extraD20s({ ...args, outcome: outcome({ natural: 9, bonus: 10, value: 19 }) }),
    ).toBe(0);
  });

  it("never asks for extra dice on a plain check", () => {
    const message = loadMessage("pf1", "skill");
    const [target] = pf1Adapter.getRollTargets(message);
    expect(
      pf1Adapter.extraD20s({
        message,
        target: "0",
        info: target.info,
        outcome: outcome({ natural: 20, value: 20 }),
      }),
    ).toBe(0);
  });
});

describe("pf1 fated attack card", () => {
  const labels = {
    title: "{item}, {attack}: {total} (was {was})",
    original: "The original roll stands.",
    newThreat:
      "Critical threat! Confirmation: {total} (d20 {natural}, modifier {modifier}). If it confirms, roll critical damage (×{mult}).",
    keptThreat: "Still a critical threat.",
    lostThreat: "No longer a critical threat.",
    natural20: "Natural 20.",
    natural1: "Natural 1.",
  };

  /** Build a fated card for attack `index` of the full attack. */
  function build(
    /** @type {number} */ index,
    /** @type {any} */ out,
    /** @type {number[]} */ extraDice = [],
  ) {
    const original = { ...fullAttack(), _id: "orig" };
    const target = pf1Adapter.getRollTargets(original)[index];
    const rollData = pf1Adapter.buildFatedRoll(target.roll, target.info, out);
    return {
      target,
      rollData,
      data: /** @type {any} */ (
        pf1Adapter.buildFatedMessageData({
          original,
          target: target.target,
          rollData,
          outcome: out,
          info: target.info,
          userId: "alice",
          extraDice,
          labels,
        })
      ),
    };
  }

  it("names the weapon and attack, with the new and old totals", () => {
    const out = resolveFateReroll({
      ...build(1, outcome({})).target.info,
      fateDie: 9,
      rules: DEFAULT_FATE_RULES,
    });
    const { data, rollData, target } = build(1, out);
    expect(data.content).toContain(
      `Practice Blade, Second Attack: ${rollData.total} (was ${target.info.total})`,
    );
  });

  it("is a new message from the player, linked to the attack it fated", () => {
    const { data } = build(0, outcome({ natural: 12, value: 12 }));
    expect(data).not.toHaveProperty("_id");
    expect(data.author).toBe("alice");
    expect(data.flags["fate-dice"]).toMatchObject({ fatedFrom: "orig", target: "attack-0" });
    expect(data.speaker).toEqual(fullAttack().speaker);
  });

  it("shows a new threat's confirmation roll with the attack's modifier", () => {
    const { data, target } = build(0, outcome({ natural: 20, value: 20 }), [14]);
    if (target.info.keptNatural >= target.info.critThreshold) return; // recorded die already threatened
    const modifier = target.info.modifier;
    expect(data.content).toContain(`Confirmation: ${14 + modifier} (d20 14, modifier ${modifier})`);
    // The multiplier comes from the card (this recorded weapon happens to be ×1).
    expect(data.content).toContain(`×${fullAttack().system.config.critMult})`);
    expect(data.content).toContain("Natural 20.");
  });

  it("says when the original roll stands", () => {
    expect(build(0, outcome({ natural: 2, value: 2 }, "original")).data.content).toContain(
      "The original roll stands.",
    );
  });

  it("leaves plain checks to the normal fated card", () => {
    const original = { ...loadMessage("pf1", "skill"), _id: "s" };
    const [target] = pf1Adapter.getRollTargets(original);
    const out = outcome({ natural: 12, value: 12 });
    expect(
      pf1Adapter.buildFatedMessageData({
        original,
        target: "0",
        rollData: pf1Adapter.buildFatedRoll(target.roll, target.info, out),
        outcome: out,
        info: target.info,
        userId: "alice",
        extraDice: [],
        labels,
      }),
    ).toBeNull();
  });

  it("escapes the weapon name", () => {
    const original = fullAttack();
    original.content = original.content.replace("Practice Blade", "<img onerror=x>");
    const target = pf1Adapter.getRollTargets(original)[0];
    const out = outcome({ natural: 12, value: 12 });
    const data = /** @type {any} */ (
      pf1Adapter.buildFatedMessageData({
        original,
        target: target.target,
        rollData: pf1Adapter.buildFatedRoll(target.roll, target.info, out),
        outcome: out,
        info: target.info,
        userId: "alice",
        extraDice: [],
        labels,
      })
    );
    expect(data.content).not.toContain("<img");
  });
});
