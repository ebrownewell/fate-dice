// @ts-check
// pf1 adapter: single-d20 checks (skills, saves, ability checks, initiative).
// Attack cards keep their rolls in message.system and get no Fate Reroll yet.

import { appendFateDie, isD20Term, parseRoll, readD20 } from "./common.js";

/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */

/** @param {any} message */
function kindOf(message) {
  if (message.flags?.core?.initiativeRoll) return "initiative";
  const subject = message.system?.subject ?? {};
  if (subject.skill) return "skill";
  if (subject.save) return "save";
  if (subject.ability) return "ability";
  if (subject.core === "init") return "initiative";
  return "other";
}

/** @param {any} message */
function getRollInfo(message) {
  const actorId = message?.speaker?.actor;
  if (!actorId || !Array.isArray(message.rolls) || message.rolls.length === 0) return null;
  const roll = parseRoll(message.rolls[0]);
  if (roll?.class !== "D20RollPF" || !roll.evaluated) return null;
  const die = roll.terms?.[0];
  if (!isD20Term(die)) return null;
  const d20 = readD20(die, "normal");
  if (!d20) return null;
  return {
    kind: kindOf(message),
    mode: /** @type {const} */ ("normal"),
    ...d20,
    total: roll.total,
    modifier: roll.total - d20.keptNatural,
    critThreshold: typeof roll.options?.critical === "number" ? roll.options.critical : 20,
    target: null,
    actorId,
  };
}

/**
 * @param {any} originalRoll
 * @param {any} info
 * @param {FateRerollResult} outcome
 */
const buildFatedRoll = (originalRoll, info, outcome) =>
  appendFateDie(originalRoll, info, outcome).roll;

export const pf1Adapter = { id: "pf1", getRollInfo, buildFatedRoll };
