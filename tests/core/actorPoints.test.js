import { describe, expect, it } from "vitest";
import { getActorPoints, writeActorPoints } from "../../scripts/core/actorPoints.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { fakeActor } from "../helpers/fakes.js";

describe("getActorPoints", () => {
  it("is 0 for an actor that has never had Fate Dice", () => {
    expect(getActorPoints(fakeActor("a"))).toBe(0);
  });

  it("reads the stored value", () => {
    expect(getActorPoints(fakeActor("a", { flags: { [MODULE_ID]: { points: 2 } } }))).toBe(2);
  });

  it.each(["2", -1, 1.5, null])("treats a corrupt value (%s) as 0", (points) => {
    expect(getActorPoints(fakeActor("a", { flags: { [MODULE_ID]: { points } } }))).toBe(0);
  });
});

describe("writeActorPoints", () => {
  it("stores the value in the module's actor flag", async () => {
    const actor = fakeActor("a");
    await writeActorPoints(actor, 3);
    expect(actor.getFlag(MODULE_ID, "points")).toBe(3);
  });
});
