// @ts-check
// dnd5e adapter: reads d20 rolls out of dnd5e chat messages and builds the
// fated version of a roll. Works on plain data (ChatMessage#toObject() and
// Roll#toJSON()), so it is tested against recorded messages without Foundry.

import { appendFateDie, isD20Term, parseRoll, readD20 } from "./common.js";

/** @typedef {import("../rules/fateReroll.js").RollMode} RollMode */
/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */

/**
 * @typedef {object} RollInfo
 * @property {string} kind "attack", "save", "ability", "skill", "tool", "death", "initiative", ...
 * @property {RollMode} mode
 * @property {number[]} dice Natural results of the original d20s.
 * @property {number} keptNatural The d20 result the roll used.
 * @property {number} total
 * @property {number} modifier total − keptNatural
 * @property {number} critThreshold
 * @property {number | null} target The roll's DC, if it has one (death saves: 10).
 * @property {string} actorId
 */

/** @type {Record<string, RollMode>} */
const MODES = { 1: "advantage", 0: "normal", "-1": "disadvantage" };

/**
 * @param {any} message Chat message data.
 * @returns {RollInfo | null} null if this isn't a d20 roll that can be fated.
 */
function getRollInfo(message) {
  const actorId = message?.speaker?.actor;
  if (!actorId || !Array.isArray(message.rolls) || message.rolls.length === 0) return null;

  const roll = parseRoll(message.rolls[0]);
  if (roll?.class !== "D20Roll" || !roll.evaluated) return null;
  const die = roll.terms?.[0];
  if (!isD20Term(die)) return null;

  const mode = MODES[String(roll.options?.advantageMode ?? die.options?.advantageMode ?? 0)];
  const d20 = mode ? readD20(die, mode) : null;
  if (!mode || !d20) return null;

  const kind = message.flags?.core?.initiativeRoll
    ? "initiative"
    : (message.flags?.dnd5e?.roll?.type ?? roll.options?.rollType ?? "other");

  return {
    kind,
    mode,
    ...d20,
    total: roll.total,
    modifier: roll.total - d20.keptNatural,
    critThreshold: die.options?.criticalSuccess ?? roll.options?.criticalSuccess ?? 20,
    target: typeof roll.options?.target === "number" ? roll.options.target : null,
    actorId,
  };
}

/**
 * Build the fated roll's data from the original roll's data.
 *
 * The fate die joins the d20's results. If it wins, the originals are
 * discarded and any bonus becomes a separate "+N[Fate]" term, so the d20
 * itself still shows the natural face. A boosted die must never crit or
 * fumble, so its crit ranges are cleared (dnd5e compares the d20's face).
 *
 * @param {any} originalRoll Roll#toJSON() of the original roll.
 * @param {RollInfo} info
 * @param {FateRerollResult} outcome
 */
function buildFatedRoll(originalRoll, info, outcome) {
  const { roll, boosted } = appendFateDie(originalRoll, info, outcome);
  if (boosted) {
    for (const options of [roll.terms[0].options, roll.options]) {
      options.criticalSuccess = null;
      options.criticalFailure = null;
    }
  }
  return roll;
}

export const dnd5eAdapter = {
  id: "dnd5e",
  getRollInfo,
  buildFatedRoll,
};
