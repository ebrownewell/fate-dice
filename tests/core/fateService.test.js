import { beforeEach, describe, expect, it } from "vitest";
import { createFateService } from "../../scripts/core/fateService.js";
import { getActorPoints } from "../../scripts/core/actorPoints.js";
import { getActorLog } from "../../scripts/core/log.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { fakeActor, fakeUser } from "../helpers/fakes.js";

const withPoints = (/** @type {number} */ points) => ({ [MODULE_ID]: { points } });

/** @type {ReturnType<typeof setup>} */
let ctx;

function setup() {
  const users = [fakeUser("gm", true), fakeUser("alice"), fakeUser("bob")];
  const actors = [
    fakeActor("alice-pc", { owners: ["alice"], flags: withPoints(1) }),
    fakeActor("bob-pc", { owners: ["bob"], flags: withPoints(0) }),
  ];
  let nextId = 0;
  let clock = 1000;
  const service = createFateService({
    getUser: (id) => users.find((u) => u.id === id),
    getActor: (id) => actors.find((a) => a.id === id),
    getMaxPoints: () => 3,
    newId: () => `e${++nextId}`,
    now: () => clock++,
  });
  const [alicePc, bobPc] = actors;
  return { service, alicePc, bobPc };
}

beforeEach(() => {
  ctx = setup();
});

describe("award", () => {
  it("lets the GM award points to several actors at once", async () => {
    const changes = await ctx.service.award(
      { actorIds: ["alice-pc", "bob-pc"], amount: 1 },
      { userId: "gm" },
    );
    expect(changes).toEqual([
      expect.objectContaining({
        action: "award",
        actorId: "alice-pc",
        before: 1,
        after: 2,
        delta: 1,
      }),
      expect.objectContaining({
        action: "award",
        actorId: "bob-pc",
        before: 0,
        after: 1,
        delta: 1,
      }),
    ]);
    expect(getActorPoints(ctx.alicePc)).toBe(2);
    expect(getActorPoints(ctx.bobPc)).toBe(1);
  });

  it("caps awards at the maximum", async () => {
    await ctx.service.award({ actorIds: ["alice-pc"], amount: 5 }, { userId: "gm" });
    expect(getActorPoints(ctx.alicePc)).toBe(3);
  });

  it("still logs an award to a character already at the maximum, with no change", async () => {
    await ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "gm" });
    await ctx.service.award({ actorIds: ["alice-pc"], amount: 1 }, { userId: "gm" });
    expect(getActorLog(ctx.alicePc).at(-1)).toMatchObject({ action: "award", delta: 0, after: 3 });
  });

  it("refuses awards from players", async () => {
    await expect(
      ctx.service.award({ actorIds: ["bob-pc"], amount: 1 }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
    expect(getActorPoints(ctx.bobPc)).toBe(0);
  });

  it("changes nothing if any actor is unknown", async () => {
    await expect(
      ctx.service.award({ actorIds: ["alice-pc", "ghost"], amount: 1 }, { userId: "gm" }),
    ).rejects.toMatchObject({ code: "not-found" });
    expect(getActorPoints(ctx.alicePc)).toBe(1);
  });

  it.each([
    ["no actor list", { amount: 1 }],
    ["an empty actor list", { actorIds: [], amount: 1 }],
    ["a bad amount", { actorIds: ["alice-pc"], amount: 0 }],
  ])("rejects %s", async (_label, payload) => {
    // @ts-expect-error deliberately invalid payload
    await expect(ctx.service.award(payload, { userId: "gm" })).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("spend", () => {
  it("lets an owner spend their own character's points", async () => {
    const change = await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "alice" });
    expect(change).toEqual({
      action: "spend",
      actorId: "alice-pc",
      userId: "alice",
      before: 1,
      after: 0,
      delta: -1,
      entryId: "e1",
    });
    expect(getActorPoints(ctx.alicePc)).toBe(0);
  });

  it("lets the GM spend on any character", async () => {
    await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "gm" });
    expect(getActorPoints(ctx.alicePc)).toBe(0);
  });

  it("refuses spending on someone else's character", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "bob" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });

  it("refuses spending more than the character has", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 2 }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "insufficient-points" });
    expect(getActorPoints(ctx.alicePc)).toBe(1);
  });

  it("cannot be double-spent by two requests at the same moment", async () => {
    await ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "gm" });
    const results = await Promise.allSettled([
      ctx.service.spend({ actorId: "alice-pc", cost: 2 }, { userId: "alice" }),
      ctx.service.spend({ actorId: "alice-pc", cost: 2 }, { userId: "alice" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(getActorPoints(ctx.alicePc)).toBe(1);
  });

  it("refuses an unknown actor", async () => {
    await expect(
      ctx.service.spend({ actorId: "ghost", cost: 1 }, { userId: "gm" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("setPoints", () => {
  it("lets the GM set a value directly", async () => {
    const change = await ctx.service.setPoints({ actorId: "bob-pc", value: 3 }, { userId: "gm" });
    expect(change).toMatchObject({ action: "set", before: 0, after: 3, delta: 3 });
  });

  it("refuses players", async () => {
    await expect(
      ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });

  it("refuses values above the maximum", async () => {
    await expect(
      ctx.service.setPoints({ actorId: "alice-pc", value: 4 }, { userId: "gm" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("refund", () => {
  it("lets the GM give back points", async () => {
    const change = await ctx.service.refund({ actorId: "alice-pc", amount: 2 }, { userId: "gm" });
    expect(change).toMatchObject({ action: "refund", before: 1, after: 3, delta: 2 });
  });

  it("refunds a logged spend, linking the spend and the refund", async () => {
    const spent = await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "alice" });
    const refund = await ctx.service.refund(
      { actorId: "alice-pc", entryId: spent.entryId, reason: "Wrong roll" },
      { userId: "gm" },
    );
    expect(refund).toMatchObject({ action: "refund", before: 0, after: 1, delta: 1 });
    const log = getActorLog(ctx.alicePc);
    expect(log.find((e) => e.id === spent.entryId)?.refundedBy).toBe(refund.entryId);
    expect(log.find((e) => e.id === refund.entryId)).toMatchObject({
      refundOf: spent.entryId,
      reason: "Wrong roll",
    });
  });

  it("refuses to refund the same spend twice", async () => {
    const spent = await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "alice" });
    await ctx.service.refund({ actorId: "alice-pc", entryId: spent.entryId }, { userId: "gm" });
    await expect(
      ctx.service.refund({ actorId: "alice-pc", entryId: spent.entryId }, { userId: "gm" }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(getActorPoints(ctx.alicePc)).toBe(1);
  });

  it("refuses to refund an unknown log entry", async () => {
    await expect(
      ctx.service.refund({ actorId: "alice-pc", entryId: "nope" }, { userId: "gm" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("caps GM refunds at the maximum", async () => {
    await ctx.service.refund({ actorId: "alice-pc", amount: 5 }, { userId: "gm" });
    expect(getActorPoints(ctx.alicePc)).toBe(3);
  });

  it("refuses players", async () => {
    await expect(
      ctx.service.refund({ actorId: "alice-pc", amount: 1 }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });
});

describe("rollback", () => {
  it("logs an automatic refund linked to the spend it undoes", async () => {
    const spent = await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "alice" });
    const undone = await ctx.service.rollback(spent);
    expect(getActorPoints(ctx.alicePc)).toBe(1);
    const log = getActorLog(ctx.alicePc);
    expect(log.find((e) => e.id === undone?.entryId)).toMatchObject({
      action: "refund",
      automatic: true,
      refundOf: spent.entryId,
    });
    expect(log.find((e) => e.id === spent.entryId)?.refundedBy).toBe(undone?.entryId);
  });
});

describe("the log", () => {
  it("saves each point change and its log entry in a single update", async () => {
    const before = ctx.alicePc.updateCalls;
    await ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "alice" });
    expect(ctx.alicePc.updateCalls).toBe(before + 1);
    expect(getActorPoints(ctx.alicePc)).toBe(0);
    expect(getActorLog(ctx.alicePc)).toHaveLength(1);
  });

  it("records what happened, who did it, when, and the balance after", async () => {
    const change = await ctx.service.award(
      { actorIds: ["alice-pc"], amount: 1, reason: "Great roleplay" },
      { userId: "gm" },
    );
    expect(getActorLog(ctx.alicePc)).toEqual([
      {
        id: change[0].entryId,
        time: expect.any(Number),
        action: "award",
        before: 1,
        after: 2,
        delta: 1,
        userId: "gm",
        reason: "Great roleplay",
      },
    ]);
  });

  it("records where a spend came from", async () => {
    await ctx.service.spend(
      { actorId: "alice-pc", cost: 1, source: { type: "reroll", messageId: "m1" } },
      { userId: "alice" },
    );
    expect(getActorLog(ctx.alicePc)[0].source).toEqual({ type: "reroll", messageId: "m1" });
  });

  it("logs GM changes too", async () => {
    await ctx.service.setPoints({ actorId: "bob-pc", value: 2 }, { userId: "gm" });
    expect(getActorLog(ctx.bobPc)[0]).toMatchObject({ action: "set", before: 0, after: 2 });
  });

  it("keeps entries oldest first", async () => {
    await ctx.service.award({ actorIds: ["alice-pc"], amount: 1 }, { userId: "gm" });
    await ctx.service.spend({ actorId: "alice-pc", cost: 2 }, { userId: "alice" });
    expect(getActorLog(ctx.alicePc).map((e) => e.action)).toEqual(["award", "spend"]);
  });

  it("logs nothing when a change is refused", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 5 }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "insufficient-points" });
    expect(getActorLog(ctx.alicePc)).toEqual([]);
  });
});

describe("permissions", () => {
  it("refuses requests from unknown users", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "stranger" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });
});
