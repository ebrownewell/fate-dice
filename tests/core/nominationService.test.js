import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNominationService } from "../../scripts/core/nominationService.js";
import { fakeUser } from "../helpers/fakes.js";

/** @type {ReturnType<typeof setup>} */
let ctx;

function setup({ mode = "vote", limit = 1, points = 1 } = {}) {
  const users = [fakeUser("gm", true), fakeUser("ann"), fakeUser("bob"), fakeUser("cat")];
  const actors = [
    { id: "ann-hero", name: "Ann's Hero", ownerIds: ["ann"] },
    { id: "bob-hero", name: "Bob's Hero", ownerIds: ["bob"] },
  ];
  /** @type {Map<string, any>} */
  const store = new Map();
  let n = 0;
  const deps = {
    getUser: (/** @type {string} */ id) => users.find((u) => u.id === id),
    getActor: (/** @type {string} */ id) => actors.find((a) => a.id === id),
    getPoints: vi.fn(() => points),
    getSettings: () => ({ nominationMode: mode, nominationLimit: limit, maxPoints: 3 }),
    getSession: () => 1,
    activePlayerIds: () => ["ann", "bob", "cat"],
    listNominations: () => [...store.values()],
    findNomination: (/** @type {string} */ id) => structuredClone(store.get(id)),
    createNomination: vi.fn(async (/** @type {any} */ nom) => {
      store.set(nom.id, structuredClone(nom));
    }),
    saveNomination: vi.fn(async (/** @type {any} */ nom) => {
      await new Promise((r) => setTimeout(r, 0));
      store.set(nom.id, structuredClone(nom));
    }),
    awardNominee: vi.fn(async () => {}),
    newId: () => `n${++n}`,
    now: () => 100,
  };
  return { deps, store, service: createNominationService(deps) };
}

beforeEach(() => {
  ctx = setup();
});

const nominate = (userId = "ann", actorId = "bob-hero", reason = "Held the door") =>
  ctx.service.nominate({ actorId, reason }, { userId });

describe("nominate", () => {
  it("creates a pending nomination and posts it", async () => {
    const nom = await nominate();
    expect(nom).toMatchObject({
      nominatorId: "ann",
      actorId: "bob-hero",
      reason: "Held the door",
      status: "pending",
      eligible: ["ann", "cat"],
    });
    expect(ctx.deps.createNomination).toHaveBeenCalledWith(nom);
  });

  it("needs a reason", async () => {
    await expect(nominate("ann", "bob-hero", "   ")).rejects.toMatchObject({
      code: "note-required",
    });
  });

  it("refuses self-nomination, the GM, unknown characters, and over-limit", async () => {
    await expect(nominate("ann", "ann-hero")).rejects.toMatchObject({ code: "not-permitted" });
    await expect(nominate("gm")).rejects.toMatchObject({ code: "not-permitted" });
    await expect(nominate("ann", "ghost")).rejects.toMatchObject({ code: "not-found" });
    await nominate();
    await expect(nominate()).rejects.toMatchObject({ code: "limit-reached" });
  });

  it("refuses when nominations are off", async () => {
    ctx = setup({ mode: "off" });
    await expect(nominate()).rejects.toMatchObject({ code: "disabled" });
  });

  it("refuses an over-long reason", async () => {
    await expect(nominate("ann", "bob-hero", "x".repeat(501))).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("vote", () => {
  it("records votes, and awards the nominee when the vote passes", async () => {
    const { id } = await nominate();
    const after = await ctx.service.vote({ nominationId: id, approve: true }, { userId: "cat" });
    expect(after.status).toBe("approved");
    expect(ctx.deps.awardNominee).toHaveBeenCalledWith(
      expect.objectContaining({ id, status: "approved" }),
    );
    expect(ctx.store.get(id).status).toBe("approved");
  });

  it("does not award when the vote fails", async () => {
    const { id } = await nominate();
    const after = await ctx.service.vote({ nominationId: id, approve: false }, { userId: "cat" });
    expect(after.status).toBe("rejected");
    expect(ctx.deps.awardNominee).not.toHaveBeenCalled();
  });

  it("refuses the nominee's owner", async () => {
    const { id } = await nominate();
    await expect(
      ctx.service.vote({ nominationId: id, approve: true }, { userId: "bob" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });

  it("refuses an unknown nomination", async () => {
    await expect(
      ctx.service.vote({ nominationId: "nope", approve: true }, { userId: "cat" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("awards only once even if the deciding votes arrive together", async () => {
    ctx = setup();
    ctx.deps.activePlayerIds = () => ["ann", "cat", "dan"];
    ctx.deps.getUser = (id) => ({ id, isGM: id === "gm" });
    ctx.service = createNominationService(ctx.deps);
    const { id } = await nominate();
    await Promise.allSettled([
      ctx.service.vote({ nominationId: id, approve: true }, { userId: "cat" }),
      ctx.service.vote({ nominationId: id, approve: true }, { userId: "dan" }),
    ]);
    expect(ctx.store.get(id).status).toBe("approved");
    expect(ctx.deps.awardNominee).toHaveBeenCalledTimes(1);
  });
});

describe("GM decisions", () => {
  it("in GM mode, the GM approves and the nominee is awarded", async () => {
    ctx = setup({ mode: "gm" });
    const { id } = await nominate();
    await ctx.service.decide({ nominationId: id, approve: true }, { userId: "gm" });
    expect(ctx.deps.awardNominee).toHaveBeenCalledTimes(1);
  });

  it("in GM mode, the GM can deny", async () => {
    ctx = setup({ mode: "gm" });
    const { id } = await nominate();
    const after = await ctx.service.decide({ nominationId: id, approve: false }, { userId: "gm" });
    expect(after.status).toBe("rejected");
    expect(ctx.deps.awardNominee).not.toHaveBeenCalled();
  });

  it("in vote mode, the GM can accept the votes so far", async () => {
    const { id } = await nominate();
    const after = await ctx.service.finalize({ nominationId: id }, { userId: "gm" });
    expect(after.status).toBe("approved"); // ann's yes vs nobody's no
    expect(ctx.deps.awardNominee).toHaveBeenCalledTimes(1);
  });

  it("players can't decide or finalize", async () => {
    const { id } = await nominate();
    await expect(
      ctx.service.decide({ nominationId: id, approve: true }, { userId: "cat" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
    await expect(
      ctx.service.finalize({ nominationId: id }, { userId: "cat" }),
    ).rejects.toMatchObject({ code: "not-permitted" });
  });

  it("if awarding fails, the nomination stays open so the GM can try again", async () => {
    ctx = setup({ mode: "gm" });
    const { id } = await nominate();
    ctx.deps.awardNominee.mockRejectedValueOnce(new Error("offline"));
    await expect(
      ctx.service.decide({ nominationId: id, approve: true }, { userId: "gm" }),
    ).rejects.toThrow("offline");
    expect(ctx.store.get(id).status).toBe("pending");
  });
});
