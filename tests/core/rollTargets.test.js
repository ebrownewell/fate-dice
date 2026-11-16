import { describe, expect, it } from "vitest";
import { getRollTargets } from "../../scripts/core/rollTargets.js";
import { dnd5eAdapter } from "../../scripts/systems/dnd5e.js";
import { pf1Adapter } from "../../scripts/systems/pf1.js";
import { firstRoll, loadMessage } from "../helpers/fixtures.js";

describe("getRollTargets", () => {
  it("gives a single-roll message one target, '0', with its first roll", () => {
    const message = loadMessage("dnd5e", "skill");
    const targets = getRollTargets(dnd5eAdapter, message);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ target: "0", info: { kind: "skill" } });
    expect(targets[0].roll).toEqual(firstRoll(message));
  });

  it("gives a message without a d20 roll no targets", () => {
    expect(getRollTargets(dnd5eAdapter, loadMessage("dnd5e", "damage"))).toEqual([]);
  });

  it("uses an adapter's own targets when it has them (pf1 attack cards)", () => {
    const targets = getRollTargets(pf1Adapter, loadMessage("pf1", "full-attack-card"));
    expect(targets.map((t) => t.target)).toEqual(["attack-0", "attack-1"]);
  });
});
