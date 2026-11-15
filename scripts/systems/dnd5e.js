// @ts-check
// dnd5e adapter: reads d20 rolls out of dnd5e chat messages and builds the
// fated version of a roll. Works on plain data (ChatMessage#toObject() and
// Roll#toJSON()), so it is tested against recorded messages without Foundry.

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

/** @param {unknown} roll */
const parseRoll = (roll) => (typeof roll === "string" ? JSON.parse(roll) : roll);

/** @param {any} term */
const isD20Term = (term) => term?.faces === 20 && Array.isArray(term.results);

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

  const considered = die.results.filter((/** @type {any} */ r) => !r.rerolled);
  const kept = considered.find((/** @type {any} */ r) => r.active && !r.discarded);
  const mode = MODES[String(roll.options?.advantageMode ?? die.options?.advantageMode ?? 0)];
  if (!kept || !mode) return null;
  if ((mode === "normal") !== (considered.length === 1)) return null;

  const kind = message.flags?.core?.initiativeRoll
    ? "initiative"
    : (message.flags?.dnd5e?.roll?.type ?? roll.options?.rollType ?? "other");

  return {
    kind,
    mode,
    dice: considered.map((/** @type {any} */ r) => r.result),
    keptNatural: kept.result,
    total: roll.total,
    modifier: roll.total - kept.result,
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
  const roll = structuredClone(parseRoll(originalRoll));
  const die = roll.terms[0];
  const fateKept = outcome.kept === "fate";

  if (fateKept) {
    for (const result of die.results) {
      if (result.rerolled) continue;
      result.active = false;
      result.discarded = true;
    }
    die.results.push({ result: outcome.fate.natural, active: true, fate: true });
    roll.total = info.modifier + outcome.result.value;
  } else {
    die.results.push({ result: outcome.fate.natural, active: false, discarded: true, fate: true });
  }

  if (fateKept && outcome.result.bonus > 0) {
    roll.terms.push(
      { class: "OperatorTerm", options: {}, evaluated: true, operator: "+" },
      {
        class: "NumericTerm",
        options: { flavor: "Fate" },
        evaluated: true,
        number: outcome.result.bonus,
      },
    );
    roll.formula = `${roll.formula} + ${outcome.result.bonus}[Fate]`;
    for (const options of [die.options, roll.options]) {
      options.criticalSuccess = null;
      options.criticalFailure = null;
    }
  }

  roll.options.fateDice = outcome;
  return roll;
}

export const dnd5eAdapter = {
  id: "dnd5e",
  getRollInfo,
  buildFatedRoll,
};
