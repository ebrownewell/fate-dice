// @ts-check
// Pure Fate Reroll rules. No Foundry globals: every system adapter feeds in
// plain numbers and turns the result back into a system roll.

/**
 * @typedef {object} FateRules
 * @property {boolean} bonusEnabled Whether a low fate die gets the bonus.
 * @property {number} threshold A fate die showing this or lower gets the bonus (1–19).
 * @property {number} bonus Amount added to a low fate die (1–100).
 */

/** @typedef {"normal" | "advantage" | "disadvantage"} RollMode */

/**
 * @typedef {object} FateDie
 * @property {number} natural The face the die actually shows.
 * @property {number} bonus Fate bonus added to it (0 for original dice).
 * @property {number} value natural + bonus.
 */

/**
 * @typedef {object} FateRerollInput
 * @property {number[]} dice Natural d20 results from the original roll.
 * @property {RollMode} mode How the original roll was made.
 * @property {number} fateDie Natural result of the new fate d20.
 * @property {FateRules} rules
 * @property {number} [critThreshold] Lowest natural face that crits (default 20).
 */

/**
 * @typedef {object} FateRerollResult
 * @property {FateDie} fate The fate die, after any bonus.
 * @property {{ natural: number, value: number }} against The original die it was compared with.
 * @property {"fate" | "original"} kept Which die the roll now uses.
 * @property {FateDie} result The kept die.
 * @property {boolean} isCritical
 * @property {boolean} isFumble
 */

/** @type {Readonly<FateRules>} */
export const DEFAULT_FATE_RULES = Object.freeze({ bonusEnabled: true, threshold: 9, bonus: 10 });

const MODES = /** @type {const} */ (["normal", "advantage", "disadvantage"]);

/**
 * @param {unknown} n
 * @param {number} min
 * @param {number} max
 */
const isWholeInRange = (n, min, max) =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/** @param {unknown} n */
const isD20Face = (n) => isWholeInRange(n, 1, 20);

/**
 * List every problem with a set of fate rules. An empty list means valid.
 * @param {FateRules} rules
 * @returns {string[]}
 */
export function validateFateRules(rules) {
  const errors = [];
  if (typeof rules?.bonusEnabled !== "boolean") errors.push("bonusEnabled must be true or false");
  if (!isWholeInRange(rules?.threshold, 1, 19)) {
    errors.push("threshold must be a whole number from 1 to 19");
  }
  if (!isWholeInRange(rules?.bonus, 1, 100)) {
    errors.push("bonus must be a whole number from 1 to 100");
  }
  return errors;
}

/**
 * Apply the fate bonus to a freshly rolled fate die.
 * @param {number} natural
 * @param {FateRules} rules
 * @returns {FateDie}
 */
export function applyFateBonus(natural, rules) {
  const bonus = rules.bonusEnabled && natural <= rules.threshold ? rules.bonus : 0;
  return { natural, bonus, value: natural + bonus };
}

/** @param {FateRerollInput} input */
function assertValidInput({ dice, mode, fateDie, rules, critThreshold }) {
  if (!MODES.includes(mode)) throw new RangeError(`Unknown roll mode: ${mode}`);
  if (!Array.isArray(dice) || dice.length === 0 || !dice.every(isD20Face)) {
    throw new RangeError("dice must be a non-empty list of d20 results (1–20)");
  }
  if (mode === "normal" && dice.length !== 1) {
    throw new RangeError("A normal roll must have exactly one d20");
  }
  if (mode !== "normal" && dice.length < 2) {
    throw new RangeError(`A ${mode} roll must have at least two d20s`);
  }
  if (!isD20Face(fateDie)) throw new RangeError("fateDie must be a d20 result (1–20)");
  if (!isD20Face(critThreshold)) throw new RangeError("critThreshold must be from 1 to 20");
  const ruleErrors = validateFateRules(rules);
  if (ruleErrors.length) throw new RangeError(`Invalid fate rules: ${ruleErrors.join("; ")}`);
}

/**
 * Resolve a Fate Reroll.
 *
 * The fate die gets its bonus first, then it is compared with the original die
 * that counts for this roll mode (the d20 when normal, the highest with advantage or
 * the lowest with disadvantage) and the higher value is kept. Ties keep the
 * original. Only an unboosted die can crit or fumble.
 *
 * @param {FateRerollInput} input
 * @returns {FateRerollResult}
 */
export function resolveFateReroll(input) {
  const { dice, mode, fateDie, rules, critThreshold = 20 } = input;
  assertValidInput({ dice, mode, fateDie, rules, critThreshold });

  const againstNatural = mode === "disadvantage" ? Math.min(...dice) : Math.max(...dice);
  const against = { natural: againstNatural, value: againstNatural };
  const fate = applyFateBonus(fateDie, rules);

  const kept = fate.value > against.value ? "fate" : "original";
  const result =
    kept === "fate" ? fate : { natural: againstNatural, bonus: 0, value: againstNatural };

  return {
    fate,
    against,
    kept,
    result,
    isCritical: result.bonus === 0 && result.natural >= critThreshold,
    isFumble: result.bonus === 0 && result.natural === 1,
  };
}
