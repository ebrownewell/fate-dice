import { describe, expect, it } from "vitest";
import {
  castVote,
  checkNomination,
  createNomination,
  decide,
  finalize,
  tally,
} from "../../scripts/core/nominations.js";

const ann = { id: "ann", isGM: false };
const gm = { id: "gm", isGM: true };
const bobsHero = { id: "bob-hero", ownerIds: ["bob"] };

/** @returns {any} */
const nomination = (/** @type {Partial<any>} */ extra = {}) => ({
  id: "n1",
  nominatorId: "ann",
  actorId: "bob-hero",
  reason: "Held the door",
  session: 1,
  mode: "vote",
  status: "pending",
  eligible: ["ann", "cat", "dan"],
  votes: { ann: true },
  createdAt: 1,
  ...extra,
});

describe("checkNomination", () => {
  const base = {
    mode: /** @type {const} */ ("gm"),
    nominator: ann,
    actor: bobsHero,
    points: 1,
    max: 3,
    session: 1,
    limit: 1,
    existing: [],
  };

  it("allows a player to nominate someone else's character", () => {
    expect(checkNomination(base)).toEqual({ ok: true });
  });

  it("refuses when nominations are off", () => {
    expect(checkNomination({ ...base, mode: "off" })).toEqual({ ok: false, code: "disabled" });
  });

  it("refuses nominating your own character", () => {
    expect(checkNomination({ ...base, actor: { id: "x", ownerIds: ["ann"] } })).toEqual({
      ok: false,
      code: "not-permitted",
    });
  });

  it("refuses a nomination from the GM, who can just award", () => {
    expect(checkNomination({ ...base, nominator: gm })).toEqual({
      ok: false,
      code: "not-permitted",
    });
  });

  it("refuses a character who is already full", () => {
    expect(checkNomination({ ...base, points: 3 })).toEqual({ ok: false, code: "at-max" });
  });

  it("refuses once the player has used their nominations this session", () => {
    const existing = [nomination({ session: 1 })];
    expect(checkNomination({ ...base, existing })).toEqual({ ok: false, code: "limit-reached" });
    expect(checkNomination({ ...base, existing, session: 2 })).toEqual({ ok: true });
  });

  it("only counts the player's own nominations towards their limit", () => {
    expect(checkNomination({ ...base, existing: [nomination({ nominatorId: "cat" })] })).toEqual({
      ok: true,
    });
  });

  it("treats a limit of 0 as unlimited", () => {
    const existing = [nomination(), nomination({ id: "n2" })];
    expect(checkNomination({ ...base, limit: 0, existing })).toEqual({ ok: true });
  });
});

describe("createNomination", () => {
  it("records who, whom, why, when and the mode", () => {
    const nom = createNomination({
      id: "n1",
      nominatorId: "ann",
      actor: bobsHero,
      reason: "  Held the door ",
      session: 3,
      mode: "gm",
      activePlayerIds: [],
      now: 5,
    });
    expect(nom).toMatchObject({
      id: "n1",
      nominatorId: "ann",
      actorId: "bob-hero",
      reason: "Held the door",
      session: 3,
      mode: "gm",
      status: "pending",
      createdAt: 5,
    });
  });

  it("in vote mode, lets online players vote except the nominee's owners, and counts the nominator as yes", () => {
    const nom = createNomination({
      id: "n1",
      nominatorId: "ann",
      actor: bobsHero,
      reason: "x",
      session: 1,
      mode: "vote",
      activePlayerIds: ["ann", "bob", "cat"],
      now: 1,
    });
    expect(nom.eligible).toEqual(["ann", "cat"]);
    expect(nom.votes).toEqual({ ann: true });
  });

  it("counts the nominator as eligible even if the online list missed them", () => {
    const nom = createNomination({
      id: "n1",
      nominatorId: "ann",
      actor: bobsHero,
      reason: "x",
      session: 1,
      mode: "vote",
      activePlayerIds: ["cat"],
      now: 1,
    });
    expect(nom.eligible).toEqual(["ann", "cat"]);
  });
});

describe("tally", () => {
  it("is pending until every eligible player has voted", () => {
    expect(tally(nomination({ votes: { ann: true, cat: true } }))).toEqual({
      yes: 2,
      no: 0,
      eligible: 3,
      outcome: "pending",
    });
  });

  it("passes with a majority once everyone has voted", () => {
    expect(tally(nomination({ votes: { ann: true, cat: true, dan: false } })).outcome).toBe(
      "approved",
    );
  });

  it("fails without a majority, and on a tie", () => {
    expect(tally(nomination({ votes: { ann: true, cat: false, dan: false } })).outcome).toBe(
      "rejected",
    );
    const even = nomination({ eligible: ["ann", "cat"], votes: { ann: true, cat: false } });
    expect(tally(even).outcome).toBe("rejected");
  });

  it("passes immediately when the nominator is the only eligible voter", () => {
    expect(tally(nomination({ eligible: ["ann"] })).outcome).toBe("approved");
  });
});

describe("castVote", () => {
  it("records a vote", () => {
    expect(castVote(nomination(), "cat", false).votes).toEqual({ ann: true, cat: false });
  });

  it("lets a voter change their mind while it's open", () => {
    const once = castVote(nomination(), "cat", false);
    expect(castVote(once, "cat", true).votes.cat).toBe(true);
  });

  it("closes the nomination when the last vote is in", () => {
    const voted = castVote(castVote(nomination(), "cat", true), "dan", false);
    expect(voted.status).toBe("approved");
  });

  it("refuses someone who isn't eligible", () => {
    expect(() => castVote(nomination(), "bob", true)).toThrow(
      expect.objectContaining({ code: "not-permitted" }),
    );
  });

  it("refuses a vote on a closed nomination or a GM-approval one", () => {
    expect(() => castVote(nomination({ status: "approved" }), "cat", true)).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
    expect(() => castVote(nomination({ mode: "gm" }), "cat", true)).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
  });

  it("does not modify the nomination passed in", () => {
    const nom = nomination();
    castVote(nom, "cat", true);
    expect(nom.votes).toEqual({ ann: true });
  });
});

describe("finalize (GM accepts the votes so far)", () => {
  it("passes when more voted yes than no", () => {
    expect(finalize(nomination({ votes: { ann: true } })).status).toBe("approved");
  });

  it("fails on a tie or a no majority", () => {
    expect(finalize(nomination({ votes: { ann: true, cat: false } })).status).toBe("rejected");
  });

  it("refuses a nomination that's already closed", () => {
    expect(() => finalize(nomination({ status: "rejected" }))).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
  });
});

describe("decide (GM approval mode)", () => {
  it("approves or denies a pending nomination", () => {
    expect(decide(nomination({ mode: "gm" }), true).status).toBe("approved");
    expect(decide(nomination({ mode: "gm" }), false).status).toBe("rejected");
  });

  it("refuses a closed nomination", () => {
    expect(() => decide(nomination({ mode: "gm", status: "approved" }), true)).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
  });
});
