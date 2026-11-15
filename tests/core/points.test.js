import { describe, expect, it } from "vitest";
import { awardPoints, refundPoints, setPoints, spendPoints } from "../../scripts/core/points.js";
import { FateError } from "../../scripts/core/errors.js";

/** @param {() => unknown} fn @param {string} code */
const expectFateError = (fn, code) => {
  expect(fn).toThrow(FateError);
  try {
    fn();
  } catch (err) {
    expect(/** @type {FateError} */ (err).code).toBe(code);
  }
};

describe("awardPoints", () => {
  it("adds points", () => {
    expect(awardPoints(1, 1, 3)).toEqual({ before: 1, after: 2, delta: 1 });
  });

  it("caps at the maximum", () => {
    expect(awardPoints(2, 5, 3)).toEqual({ before: 2, after: 3, delta: 1 });
  });

  it("gives nothing when already at the maximum", () => {
    expect(awardPoints(3, 1, 3)).toEqual({ before: 3, after: 3, delta: 0 });
  });

  it("never takes points away if the maximum was lowered below the current value", () => {
    expect(awardPoints(5, 1, 3)).toEqual({ before: 5, after: 5, delta: 0 });
  });

  it.each([0, -1, 1.5, NaN])("rejects an amount of %s", (amount) => {
    expectFateError(() => awardPoints(1, amount, 3), "invalid");
  });
});

describe("spendPoints", () => {
  it("removes points", () => {
    expect(spendPoints(3, 2)).toEqual({ before: 3, after: 1, delta: -2 });
  });

  it("can spend down to zero", () => {
    expect(spendPoints(2, 2)).toEqual({ before: 2, after: 0, delta: -2 });
  });

  it("allows a free (cost 0) spend", () => {
    expect(spendPoints(1, 0)).toEqual({ before: 1, after: 1, delta: 0 });
  });

  it("refuses to spend more than the character has", () => {
    expectFateError(() => spendPoints(1, 2), "insufficient-points");
  });

  it.each([-1, 1.5, NaN])("rejects a cost of %s", (cost) => {
    expectFateError(() => spendPoints(3, cost), "invalid");
  });
});

describe("setPoints", () => {
  it.each([0, 2, 3])("sets any value from 0 to the maximum (%i)", (value) => {
    expect(setPoints(1, value, 3)).toEqual({ before: 1, after: value, delta: value - 1 });
  });

  it.each([-1, 4, 2.5])("rejects %s", (value) => {
    expectFateError(() => setPoints(1, value, 3), "invalid");
  });
});

describe("refundPoints", () => {
  it("gives points back", () => {
    expect(refundPoints(1, 2)).toEqual({ before: 1, after: 3, delta: 2 });
  });

  it("caps at the maximum when one is given", () => {
    expect(refundPoints(3, 1, 3)).toEqual({ before: 3, after: 3, delta: 0 });
  });

  it("is uncapped without a maximum, so a rollback restores exactly what was taken", () => {
    expect(refundPoints(3, 1)).toEqual({ before: 3, after: 4, delta: 1 });
  });

  it.each([0, -1, 1.5])("rejects an amount of %s", (amount) => {
    expectFateError(() => refundPoints(1, amount), "invalid");
  });
});
