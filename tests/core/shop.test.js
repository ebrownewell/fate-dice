import { describe, expect, it } from "vitest";
import {
  checkPurchase,
  countPurchases,
  currentCost,
  normalizeItem,
  validateItem,
} from "../../scripts/core/shop.js";

/** @returns {any} */
const item = (/** @type {Partial<any>} */ extra = {}) => ({
  id: "feet",
  name: "Back on Your Feet",
  description: "Stand up with 1 HP.",
  cost: 2,
  kind: "purchase",
  costStep: 0,
  costStepPer: "campaign",
  limit: { count: null, per: "session" },
  requiresNote: false,
  enabled: true,
  ...extra,
});

/** A logged shop purchase. @returns {any} */
const bought = (/** @type {Partial<any>} */ extra = {}) => ({
  id: `e${Math.random()}`,
  time: 1,
  action: "spend",
  before: 3,
  after: 1,
  delta: -2,
  userId: "alice",
  session: 1,
  source: { type: "shop", itemId: "feet", name: "Back on Your Feet" },
  ...extra,
});

describe("validateItem", () => {
  it("accepts a complete item", () => {
    expect(validateItem(item())).toEqual([]);
  });

  it.each([
    [{ name: "" }, "name"],
    [{ name: "x".repeat(101) }, "name"],
    [{ cost: -1 }, "cost"],
    [{ cost: 1.5 }, "cost"],
    [{ cost: 100 }, "cost"],
    [{ kind: "gift" }, "kind"],
    [{ costStep: -1 }, "costStep"],
    [{ costStepPer: "week" }, "costStepPer"],
    [{ limit: { count: 0, per: "session" } }, "limit"],
    [{ limit: { count: 1, per: "week" } }, "limit"],
    [{ requiresNote: "yes" }, "requiresNote"],
    [{ description: 5 }, "description"],
    [{ description: "x".repeat(2001) }, "description"],
  ])("rejects %j (problem with %s)", (extra, field) => {
    expect(validateItem(item(extra)).join(" ")).toContain(field);
  });

  it("allows a free item and an unlimited item", () => {
    expect(validateItem(item({ cost: 0, limit: { count: null, per: "session" } }))).toEqual([]);
  });
});

describe("normalizeItem", () => {
  it("fills in defaults for missing optional fields", () => {
    expect(normalizeItem({ name: "Lucky Find", cost: 1 }, () => "new-id")).toEqual({
      id: "new-id",
      name: "Lucky Find",
      description: "",
      cost: 1,
      kind: "purchase",
      costStep: 0,
      costStepPer: "campaign",
      limit: { count: null, per: "session" },
      requiresNote: false,
      enabled: true,
    });
  });

  it("drops unknown fields and trims the name", () => {
    const normalized = normalizeItem({ name: "  Odd  ", cost: 1, evil: "<script>" }, () => "x");
    expect(normalized).not.toHaveProperty("evil");
    expect(normalized.name).toBe("Odd");
  });

  it("keeps an existing id", () => {
    expect(normalizeItem(item(), () => "new").id).toBe("feet");
  });
});

describe("countPurchases", () => {
  it("counts this session's purchases of the item", () => {
    const log = [bought({ session: 1 }), bought({ session: 2 }), bought({ session: 2 })];
    expect(countPurchases(log, "feet", { per: "session", session: 2 })).toBe(2);
  });

  it("counts every purchase for the campaign", () => {
    const log = [bought({ session: 1 }), bought({ session: 2 })];
    expect(countPurchases(log, "feet", { per: "campaign", session: 2 })).toBe(2);
  });

  it("ignores refunded purchases, other items, and non-shop entries", () => {
    const log = [
      bought({ refundedBy: "r1" }),
      bought({ source: { type: "shop", itemId: "other", name: "Other" } }),
      bought({ source: { type: "reroll", messageId: "m1" } }),
      { ...bought(), source: undefined },
    ];
    expect(countPurchases(log, "feet", { per: "campaign", session: 1 })).toBe(0);
  });

  it("counts flaws taken, which are logged as awards", () => {
    const flaw = bought({
      action: "award",
      delta: 1,
      source: { type: "flaw", itemId: "feet", name: "x" },
    });
    expect(countPurchases([flaw], "feet", { per: "campaign", session: 1 })).toBe(1);
  });
});

describe("currentCost", () => {
  it("is the base cost for a fixed-price item", () => {
    expect(currentCost(item(), [bought(), bought()], 1)).toBe(2);
  });

  it("rises by the step for each earlier purchase", () => {
    const scaling = item({ costStep: 1, costStepPer: "campaign" });
    expect(currentCost(scaling, [], 1)).toBe(2);
    expect(currentCost(scaling, [bought({ session: 1 }), bought({ session: 2 })], 2)).toBe(4);
  });

  it("can reset the increase each session", () => {
    const scaling = item({ costStep: 1, costStepPer: "session" });
    expect(currentCost(scaling, [bought({ session: 1 }), bought({ session: 2 })], 2)).toBe(3);
  });
});

describe("checkPurchase", () => {
  const base = { points: 3, max: 3, session: 1, log: [], note: "" };

  it("allows a purchase the character can afford", () => {
    expect(checkPurchase({ ...base, item: item() })).toEqual({ ok: true, cost: 2, gain: 0 });
  });

  it("refuses a disabled item", () => {
    expect(checkPurchase({ ...base, item: item({ enabled: false }) })).toEqual({
      ok: false,
      code: "not-found",
    });
  });

  it("refuses when the character can't afford it", () => {
    expect(checkPurchase({ ...base, points: 1, item: item() })).toEqual({
      ok: false,
      code: "insufficient-points",
    });
  });

  it("refuses once the limit is reached this session, and allows it again next session", () => {
    const limited = item({ limit: { count: 1, per: "session" } });
    const log = [bought({ session: 1 })];
    expect(checkPurchase({ ...base, item: limited, log })).toEqual({
      ok: false,
      code: "limit-reached",
    });
    expect(checkPurchase({ ...base, item: limited, log, session: 2 })).toMatchObject({ ok: true });
  });

  it("requires a note when the item asks for one", () => {
    const noted = item({ requiresNote: true });
    expect(checkPurchase({ ...base, item: noted, note: "  " })).toEqual({
      ok: false,
      code: "note-required",
    });
    expect(checkPurchase({ ...base, item: noted, note: "Found a rope" })).toMatchObject({
      ok: true,
    });
  });

  it("charges the scaled cost", () => {
    const scaling = item({ cost: 1, costStep: 1 });
    expect(checkPurchase({ ...base, item: scaling, log: [bought()] })).toMatchObject({ cost: 2 });
  });

  it("a flaw grants its value instead of costing it", () => {
    const flaw = item({ kind: "flaw", cost: 1 });
    expect(checkPurchase({ ...base, points: 1, item: flaw })).toEqual({
      ok: true,
      cost: 0,
      gain: 1,
    });
  });

  it("refuses a flaw that would give nothing because the character is full", () => {
    expect(checkPurchase({ ...base, points: 3, item: item({ kind: "flaw", cost: 1 }) })).toEqual({
      ok: false,
      code: "at-max",
    });
  });
});
