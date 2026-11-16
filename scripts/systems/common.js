// @ts-check
// Helpers shared by the system adapters: reading a d20 term and adding the
// fate die to a roll's data. Plain data only (Roll#toJSON()).

/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */
/** @typedef {import("../rules/fateReroll.js").RollMode} RollMode */

/** @param {unknown} roll */
export const parseRoll = (roll) => (typeof roll === "string" ? JSON.parse(roll) : roll);

/** @param {any} term */
export const isD20Term = (term) => term?.faces === 20 && Array.isArray(term.results);

/**
 * The d20 results that count (ignoring dice replaced by a reroll), and the one kept.
 * @param {any} die
 * @param {RollMode} mode
 * @returns {{ dice: number[], keptNatural: number } | null} null if the term doesn't match the mode.
 */
export function readD20(die, mode) {
  const considered = die.results.filter((/** @type {any} */ r) => !r.rerolled);
  const kept = considered.find((/** @type {any} */ r) => r.active && !r.discarded);
  if (!kept || (mode === "normal") !== (considered.length === 1)) return null;
  return { dice: considered.map((/** @type {any} */ r) => r.result), keptNatural: kept.result };
}

/**
 * Add the fate die to a roll. If it wins, the original dice are discarded and
 * any bonus becomes a separate "+N[Fate]" term, so the d20 still shows its
 * natural face. Returns a new object; the input is not modified.
 * @param {any} originalRoll
 * @param {{ modifier: number }} info
 * @param {FateRerollResult} outcome
 * @returns {{ roll: any, boosted: boolean }} boosted: the kept die carries a bonus.
 */
export function appendFateDie(originalRoll, info, outcome) {
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

  const boosted = fateKept && outcome.result.bonus > 0;
  if (boosted) {
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
  }

  roll.options = { ...roll.options, fateDice: outcome };
  return { roll, boosted };
}
