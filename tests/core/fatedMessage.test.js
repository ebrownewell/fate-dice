import { describe, expect, it } from "vitest";
import { buildFatedMessageData } from "../../scripts/core/fatedMessage.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { firstRoll, loadMessage } from "../helpers/fixtures.js";

const outcome = {
  fate: { natural: 7, bonus: 10, value: 17 },
  against: { natural: 1, value: 1 },
  kept: /** @type {const} */ ("fate"),
  result: { natural: 7, bonus: 10, value: 17 },
  isCritical: false,
  isFumble: false,
};

/** @param {string} name */
function build(name, { total = 17, userId = "alice" } = {}) {
  const original = { ...loadMessage("dnd5e", name), _id: "orig" };
  const rollData = { ...firstRoll(original), total };
  const data = buildFatedMessageData({
    original,
    rollData,
    outcome,
    userId,
    flavorSuffix: "Fate Reroll",
  });
  return { original, rollData, data };
}

describe("buildFatedMessageData", () => {
  it("is a new message: no id, timestamp or stats from the original", () => {
    const { data } = build("attack-disadvantage");
    expect(data).not.toHaveProperty("_id");
    expect(data).not.toHaveProperty("timestamp");
    expect(data).not.toHaveProperty("_stats");
  });

  it("carries the fated roll", () => {
    const { data, rollData } = build("attack-disadvantage");
    expect(data.rolls).toEqual([JSON.stringify(rollData)]);
  });

  it("is authored by the player who spent the Fate Die", () => {
    expect(build("attack-disadvantage").data.author).toBe("alice");
  });

  it("keeps the system's flags and links back to the original", () => {
    const { data, original } = build("attack-disadvantage");
    expect(data.flags.dnd5e).toEqual(original.flags.dnd5e);
    expect(data.flags[MODULE_ID]).toEqual({ fatedFrom: "orig", outcome });
  });

  it("never copies the original's own fate flags", () => {
    const original = { ...loadMessage("dnd5e", "skill"), _id: "orig" };
    original.flags[MODULE_ID] = { fatedBy: "someone" };
    const data = buildFatedMessageData({
      original,
      rollData: firstRoll(original),
      outcome,
      userId: "alice",
      flavorSuffix: "Fate Reroll",
    });
    expect(data.flags[MODULE_ID]).not.toHaveProperty("fatedBy");
  });

  it("marks the flavor text", () => {
    expect(build("attack-disadvantage").data.flavor).toBe(
      "Longsword - Attack Roll (Disadvantage) (Fate Reroll)",
    );
  });

  it("updates content that showed the old total (initiative)", () => {
    expect(build("initiative", { total: 21 }).data.content).toBe("21");
  });

  it("leaves other content alone", () => {
    expect(build("attack-disadvantage").data.content).toBe("");
  });

  it("keeps who said it and who can see it", () => {
    const { data, original } = build("save");
    expect(data.speaker).toEqual(original.speaker);
    expect(data.whisper).toEqual(original.whisper);
    expect(data.blind).toBe(original.blind);
  });

  it("does not modify the original", () => {
    const original = { ...loadMessage("dnd5e", "initiative"), _id: "orig" };
    const before = structuredClone(original);
    buildFatedMessageData({
      original,
      rollData: { ...firstRoll(original), total: 30 },
      outcome,
      userId: "alice",
      flavorSuffix: "Fate Reroll",
    });
    expect(original).toEqual(before);
  });
});
