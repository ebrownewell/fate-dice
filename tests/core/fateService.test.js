import { beforeEach, describe, expect, it } from "vitest";
import { createFateService } from "../../scripts/core/fateService.js";
import { getActorPoints } from "../../scripts/core/actorPoints.js";
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
  const service = createFateService({
    getUser: (id) => users.find((u) => u.id === id),
    getActor: (id) => actors.find((a) => a.id === id),
    getMaxPoints: () => 3,
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
      { action: "award", actorId: "alice-pc", userId: "gm", before: 1, after: 2, delta: 1 },
      { action: "award", actorId: "bob-pc", userId: "gm", before: 0, after: 1, delta: 1 },
    ]);
    expect(getActorPoints(ctx.alicePc)).toBe(2);
    expect(getActorPoints(ctx.bobPc)).toBe(1);
  });

  it("caps awards at the maximum", async () => {
    await ctx.service.award({ actorIds: ["alice-pc"], amount: 5 }, { userId: "gm" });
    expect(getActorPoints(ctx.alicePc)).toBe(3);
  });

  it("does not write to the actor when nothing changes", async () => {
    await ctx.service.setPoints({ actorId: "alice-pc", value: 3 }, { userId: "gm" });
    const writes = ctx.alicePc.setFlagCalls;
    await ctx.service.award({ actorIds: ["alice-pc"], amount: 1 }, { userId: "gm" });
    expect(ctx.alicePc.setFlagCalls).toBe(writes);
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
  it("lets the GM give back spent points", async () => {
    const change = await ctx.service.refund({ actorId: "alice-pc", amount: 2 }, { userId: "gm" });
    expect(change).toMatchObject({ action: "refund", before: 1, after: 3, delta: 2 });
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

describe("permissions", () => {
  it("refuses requests from unknown users", async () => {
    await expect(
      ctx.service.spend({ actorId: "alice-pc", cost: 1 }, { userId: "stranger" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });
});
