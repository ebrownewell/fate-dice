import { describe, expect, it } from "vitest";
import { toLogRows } from "../../scripts/ui/logRows.js";

/**
 * @param {Partial<any>} extra
 * @returns {import("../../scripts/core/log.js").LogEntry}
 */
const entry = (extra) =>
  /** @type {any} */ ({
    id: "e1",
    time: 1000,
    action: "award",
    before: 0,
    after: 1,
    delta: 1,
    userId: "gm",
    ...extra,
  });

const names = /** @type {Record<string, string>} */ ({ gm: "Gamemaster", alice: "Alice" });
const options = {
  isGM: false,
  getUserName: (/** @type {string} */ id) => names[id],
  formatTime: (/** @type {number} */ t) => `t${t}`,
};

describe("toLogRows", () => {
  it("lists the newest entry first", () => {
    const rows = toLogRows([entry({ id: "old", time: 1 }), entry({ id: "new", time: 2 })], options);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("keeps the recorded order for entries made in the same millisecond", () => {
    const rows = toLogRows(
      [entry({ id: "first", time: 5 }), entry({ id: "second", time: 5 })],
      options,
    );
    expect(rows.map((r) => r.id)).toEqual(["second", "first"]);
  });

  it("shows when, the change with its sign, the balance after, and who", () => {
    const [row] = toLogRows(
      [entry({ action: "spend", delta: -2, before: 3, after: 1, userId: "alice" })],
      options,
    );
    expect(row).toMatchObject({ time: "t1000", delta: "-2", after: 1, by: "Alice" });
    const [award] = toLogRows([entry({})], options);
    expect(award.delta).toBe("+1");
    const [none] = toLogRows([entry({ delta: 0, before: 3, after: 3 })], options);
    expect(none.delta).toBe("0");
  });

  it("names someone who has since been deleted", () => {
    const [row] = toLogRows([entry({ userId: "gone" })], options);
    expect(row.by).toBeNull();
  });

  it.each([
    [{ action: "award" }, "FATEDICE.Log.Award"],
    [{ action: "spend", delta: -1 }, "FATEDICE.Log.Spend"],
    [
      { action: "spend", delta: -1, source: { type: "reroll", messageId: "m1" } },
      "FATEDICE.Log.Reroll",
    ],
    [{ action: "set" }, "FATEDICE.Log.Set"],
    [{ action: "refund" }, "FATEDICE.Log.Refund"],
    [{ action: "refund", automatic: true }, "FATEDICE.Log.AutoRefund"],
  ])("describes %j as %s", (extra, key) => {
    expect(toLogRows([entry(extra)], options)[0].whatKey).toBe(key);
  });

  it("carries the note and the linked chat message", () => {
    const [row] = toLogRows(
      [
        entry({
          action: "spend",
          delta: -1,
          reason: "Lucky",
          source: { type: "reroll", messageId: "m1" },
        }),
      ],
      options,
    );
    expect(row).toMatchObject({ note: "Lucky", messageId: "m1" });
  });

  it("marks refunded spends", () => {
    const [row] = toLogRows([entry({ action: "spend", delta: -1, refundedBy: "e2" })], options);
    expect(row.refunded).toBe(true);
  });

  it("offers a refund on unrefunded spends, to the GM only", () => {
    const spend = entry({ action: "spend", delta: -1 });
    expect(toLogRows([spend], options)[0].canRefund).toBe(false);
    expect(toLogRows([spend], { ...options, isGM: true })[0].canRefund).toBe(true);
    expect(
      toLogRows([{ ...spend, refundedBy: "e2" }], { ...options, isGM: true })[0].canRefund,
    ).toBe(false);
    expect(toLogRows([entry({})], { ...options, isGM: true })[0].canRefund).toBe(false);
  });

  it("does not modify the log passed in", () => {
    const log = [entry({ id: "a", time: 1 }), entry({ id: "b", time: 2 })];
    toLogRows(log, options);
    expect(log.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
