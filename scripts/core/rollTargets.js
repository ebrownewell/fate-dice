// @ts-check
// A message can hold more than one roll that could be fated (a pf1 full
// attack holds several). Each is a "target"; single-roll messages have one,
// called "0".

import { parseRoll } from "../systems/common.js";

/**
 * @typedef {object} RollTarget
 * @property {string} target
 * @property {any} info RollInfo from the adapter.
 * @property {any} roll The roll's data.
 */

/**
 * @param {any} adapter A system adapter, or null.
 * @param {any} message Chat message data.
 * @returns {RollTarget[]}
 */
export function getRollTargets(adapter, message) {
  if (!adapter) return [];
  if (adapter.getRollTargets) return adapter.getRollTargets(message);
  const info = adapter.getRollInfo(message);
  return info ? [{ target: "0", info, roll: parseRoll(message.rolls[0]) }] : [];
}
