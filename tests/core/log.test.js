import { describe, expect, it } from "vitest";
import {
  createLogEntry,
  findRefundableSpend,
  getActorLog,
  markRefunded,
} from "../../scripts/core/log.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { fakeActor } from "../helpers/fakes.js";

/** @returns {any} */
const spend = (/** @type {Partial<any>} */ extra = {}) => ({
  id: "e1",
  time: 1000,
  action: "spend",
  before: 2,
  after: 1,
  delta: -1,
  userId: "alice",
  ...extra,
});

describe("createLogEntry", () => {
  it("records the change, who made it and when", () => {
    expect(
      createLogEntry({
        id: "e1",
        time: 1000,
        action: "award",
        change: { before: 1, after: 2, delta: 1 },
        userId: "gm",
      }),
    ).toEqual({
      id: "e1",
      time: 1000,
      action: "award",
      before: 1,
      after: 2,
      delta: 1,
      userId: "gm",
    });
  });

  it("includes a note, source and link when given", () => {
    const entry = createLogEntry({
      id: "e2",
      time: 1,
      action: "spend",
      change: { before: 2, after: 1, delta: -1 },
      userId: "alice",
      reason: "Lucky break",
      source: { type: "reroll", messageId: "m1" },
    });
    expect(entry).toMatchObject({
      reason: "Lucky break",
      source: { type: "reroll", messageId: "m1" },
    });
  });

  it("leaves out empty notes", () => {
    const entry = createLogEntry({
      id: "e3",
      time: 1,
      action: "award",
      change: { before: 0, after: 1, delta: 1 },
      userId: "gm",
      reason: "  ",
    });
    expect(entry).not.toHaveProperty("reason");
  });
});

describe("getActorLog", () => {
  it("is empty for a character with no history", () => {
    expect(getActorLog(fakeActor("a"))).toEqual([]);
  });

  it("reads the stored log", () => {
    const actor = fakeActor("a", { flags: { [MODULE_ID]: { log: [spend()] } } });
    expect(getActorLog(actor)).toEqual([spend()]);
  });

  it("treats a corrupt log as empty", () => {
    expect(getActorLog(fakeActor("a", { flags: { [MODULE_ID]: { log: "oops" } } }))).toEqual([]);
  });
});

describe("findRefundableSpend", () => {
  it("finds an unrefunded spend", () => {
    expect(findRefundableSpend([spend()], "e1")).toEqual(spend());
  });

  it("refuses an unknown entry", () => {
    expect(() => findRefundableSpend([spend()], "nope")).toThrow(
      expect.objectContaining({ code: "not-found" }),
    );
  });

  it("refuses an entry that was already refunded", () => {
    expect(() => findRefundableSpend([spend({ refundedBy: "e9" })], "e1")).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
  });

  it("refuses an entry that isn't a spend", () => {
    expect(() => findRefundableSpend([spend({ action: "award", delta: 1 })], "e1")).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
  });
});

describe("markRefunded", () => {
  it("links the spend to its refund without changing the original list", () => {
    const log = [spend(), spend({ id: "e2" })];
    const updated = markRefunded(log, "e1", "e3");
    expect(updated[0]).toEqual({ ...spend(), refundedBy: "e3" });
    expect(updated[1]).toEqual(log[1]);
    expect(log[0]).not.toHaveProperty("refundedBy");
  });
});
