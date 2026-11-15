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
  let session = 1;
  /** @type {any[]} */
  const shop = [
    {
      id: "feet",
      name: "Back on Your Feet",
      description: "",
      cost: 1,
      kind: "purchase",
      costStep: 0,
      costStepPer: "campaign",
      limit: { count: 1, per: "session" },
      requiresNote: false,
      enabled: true,
    },
    {
      id: "flaw",
      name: "Flaw: Bad Habit",
      description: "",
      cost: 1,
      kind: "flaw",
      costStep: 0,
      costStepPer: "campaign",
      limit: { count: null, per: "session" },
      requiresNote: true,
      enabled: true,
    },
  ];
  const service = createFateService({
    getUser: (id) => users.find((u) => u.id === id),
    getActor: (id) => actors.find((a) => a.id === id),
    getMaxPoints: () => 3,
    getSession: () => session,
    getShopItems: () => shop,
    newId: () => `e${++nextId}`,
    now: () => clock++,
  });
  const [alicePc, bobPc] = actors;
  return { service, alicePc, bobPc, setSession: (/** @type {number} */ n) => (session = n) };
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
        session: 1,
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

describe("purchase", () => {
  it("lets an owner buy a shop item, logging what was bought and the session", async () => {
    const change = await ctx.service.purchase(
      { actorId: "alice-pc", itemId: "feet" },
      { userId: "alice" },
    );
    expect(change).toMatchObject({ action: "spend", before: 1, after: 0, delta: -1 });
    expect(getActorLog(ctx.alicePc).at(-1)).toMatchObject({
      action: "spend",
      session: 1,
      source: { type: "shop", itemId: "feet", name: "Back on Your Feet" },
    });
  });

  it("enforces the item's limit, which resets next session", async () => {
    await ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "gm" });
    await ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" });
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "limit-reached" });
    ctx.setSession(2);
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" }),
    ).resolves.toMatchObject({ after: 1 });
  });

  it("can't get past a limit with two purchases at the same moment", async () => {
    await ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "gm" });
    const results = await Promise.allSettled([
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" }),
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(getActorPoints(ctx.alicePc)).toBe(2);
  });

  it("taking a flaw grants Fate Dice and records the note", async () => {
    const change = await ctx.service.purchase(
      { actorId: "alice-pc", itemId: "flaw", note: "Picked a fight with the guard" },
      { userId: "alice" },
    );
    expect(change).toMatchObject({ action: "award", before: 1, after: 2, delta: 1 });
    expect(getActorLog(ctx.alicePc).at(-1)).toMatchObject({
      reason: "Picked a fight with the guard",
      source: { type: "flaw", itemId: "flaw", name: "Flaw: Bad Habit" },
    });
  });

  it("requires a note when the item asks for one", async () => {
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "flaw" }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "note-required" });
  });

  it("refuses someone else's character, an unknown item, and an unaffordable one", async () => {
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "bob" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "nope" }, { userId: "alice" }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      ctx.service.purchase({ actorId: "bob-pc", itemId: "feet" }, { userId: "bob" }),
    ).rejects.toMatchObject({ code: "insufficient-points" });
    expect(getActorLog(ctx.bobPc)).toEqual([]);
  });

  it("can be refunded from the log like any spend", async () => {
    const change = await ctx.service.purchase(
      { actorId: "alice-pc", itemId: "feet" },
      { userId: "alice" },
    );
    await ctx.service.refund({ actorId: "alice-pc", entryId: change.entryId }, { userId: "gm" });
    expect(getActorPoints(ctx.alicePc)).toBe(1);
    // A refunded purchase no longer counts towards the limit.
    await expect(
      ctx.service.purchase({ actorId: "alice-pc", itemId: "feet" }, { userId: "alice" }),
    ).resolves.toMatchObject({ after: 0 });
  });
});

describe("permissions", () => {
  it("refuses requests from unknown users", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "stranger" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });
});
