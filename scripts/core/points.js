// @ts-check
import { FateError } from "./errors.js";

/** @typedef {import("./types.js").PointChange} PointChange */

/**
 * @param {unknown} n
 * @param {number} min
 */
const isWholeAtLeast = (n, min) => typeof n === "number" && Number.isInteger(n) && n >= min;

/** @param {number} before @param {number} after @returns {PointChange} */
const change = (before, after) => ({ before, after, delta: after - before });

/**
 * Add points, capped at the maximum. Never lowers a value that is already
 * above the maximum (e.g. after the GM lowers the cap).
 * @param {number} current
 * @param {number} amount
 * @param {number} max
 */
export function awardPoints(current, amount, max) {
  if (!isWholeAtLeast(amount, 1)) throw new FateError("invalid", "Award must be at least 1");
  return change(current, Math.max(current, Math.min(max, current + amount)));
}

/**
 * Remove points. A cost of 0 is allowed (free purchases).
 * @param {number} current
 * @param {number} cost
 */
export function spendPoints(current, cost) {
  if (!isWholeAtLeast(cost, 0)) throw new FateError("invalid", "Cost must be 0 or more");
  if (cost > current) throw new FateError("insufficient-points", "Not enough Fate Dice");
  return change(current, current - cost);
}

/**
 * Set points directly, from 0 to the maximum.
 * @param {number} current
 * @param {number} value
 * @param {number} max
 */
export function setPoints(current, value, max) {
  if (!isWholeAtLeast(value, 0) || value > max) {
    throw new FateError("invalid", `Fate Dice must be from 0 to ${max}`);
  }
  return change(current, value);
}
