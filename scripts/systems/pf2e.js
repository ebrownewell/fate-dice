// @ts-check
// pf2e adapter: checks (skills, saves, perception, strikes, initiative...).
// Fortune and misfortune ("roll twice, keep higher/lower") map to advantage
// and disadvantage. A fated check gets its degree of success recomputed.

import { DEGREE_NAMES, degreeOfSuccess, rewriteDegreeHtml } from "../rules/pf2eDegree.js";
import { appendFateDie, isD20Term, parseRoll, readD20 } from "./common.js";

/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */

/** pf2e check types → the kinds the module uses. */
const KINDS = /** @type {Record<string, string>} */ ({
  "skill-check": "skill",
  "saving-throw": "save",
  "perception-check": "perception",
  "attack-roll": "attack",
  initiative: "initiative",
  "flat-check": "flat",
});

/** @param {any} die */
const modeOf = (die) =>
  die.modifiers?.includes("kh")
    ? "advantage"
    : die.modifiers?.includes("kl")
      ? "disadvantage"
      : "normal";

/** @param {any} message */
function getRollInfo(message) {
  const actorId = message?.speaker?.actor;
  if (!actorId || !Array.isArray(message.rolls) || message.rolls.length === 0) return null;
  const roll = parseRoll(message.rolls[0]);
  if (roll?.class !== "CheckRoll" || !roll.evaluated) return null;
  const die = roll.terms?.[0];
  if (!isD20Term(die)) return null;

  const context = message.flags?.pf2e?.context ?? {};
  // Abilities that adjust the degree of success can't be reapplied safely.
  if (context.dosAdjustments && Object.keys(context.dosAdjustments).length > 0) return null;

  const mode = modeOf(die);
  const d20 = readD20(die, /** @type {any} */ (mode));
  if (!d20) return null;

  const type = message.flags?.core?.initiativeRoll ? "initiative" : context.type;
  return {
    kind: KINDS[type] ?? type ?? "other",
    mode: /** @type {"normal" | "advantage" | "disadvantage"} */ (mode),
    ...d20,
    total: roll.total,
    modifier: roll.total - d20.keptNatural,
    critThreshold: 20,
    target: null,
    dc: typeof context.dc?.value === "number" ? context.dc.value : null,
    actorId,
  };
}

/**
 * @param {any} originalRoll
 * @param {any} info
 * @param {FateRerollResult} outcome
 */
function buildFatedRoll(originalRoll, info, outcome) {
  const { roll, boosted } = appendFateDie(originalRoll, info, outcome);
  roll.options.isReroll = true;
  if (info.dc !== null) {
    roll.options.degreeOfSuccess = degreeOfSuccess({
      total: roll.total,
      dc: info.dc,
      natural: outcome.result.natural,
      boosted,
    });
  } else {
    delete roll.options.degreeOfSuccess;
  }
  return roll;
}

/**
 * Update what pf2e stores and shows about the outcome on the fated card.
 * @param {any} data Fated message data.
 * @param {{ info: any, outcome: FateRerollResult, rollData: any, localize: (key: string) => string }} args
 */
function adjustFatedMessage(data, { info, rollData, localize }) {
  const context = data.flags?.pf2e?.context;
  if (!context) return data;
  context.isReroll = true;
  const degree = rollData.options?.degreeOfSuccess;
  if (info.dc === null || typeof degree !== "number") return data;
  const name = DEGREE_NAMES[degree];
  context.outcome = name;
  context.unadjustedOutcome = name;
  data.flavor = rewriteDegreeHtml(data.flavor ?? "", {
    degree,
    label: localize(`PF2E.Check.Result.Degree.Check.${name}`),
    margin: rollData.total - info.dc,
  });
  return data;
}

export const pf2eAdapter = { id: "pf2e", getRollInfo, buildFatedRoll, adjustFatedMessage };
