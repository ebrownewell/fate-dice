// @ts-check
// pf2e degrees of success, for recomputing a fated check.

import { escapeHtml } from "../ui/purchaseMessage.js";

/** pf2e's names for degrees 0–3. */
export const DEGREE_NAMES = /** @type {const} */ ([
  "criticalFailure",
  "failure",
  "success",
  "criticalSuccess",
]);

/**
 * The degree of success of a check: ±10 from the DC for criticals, and a
 * natural 20 or 1 moves it a step. A boosted fate die is never a natural
 * 20 or 1 for this purpose.
 * @param {{ total: number, dc: number, natural: number, boosted: boolean }} input
 * @returns {0 | 1 | 2 | 3}
 */
export function degreeOfSuccess({ total, dc, natural, boosted }) {
  let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (!boosted && natural === 20) degree += 1;
  if (!boosted && natural === 1) degree -= 1;
  return /** @type {0 | 1 | 2 | 3} */ (Math.min(3, Math.max(0, degree)));
}

const RESULT =
  /(<div class="result degree-of-success">[\s\S]*?<span class=")[A-Za-z]+(">)[^<]*(<\/span>)/;
const MARGIN =
  /(<div class="result degree-of-success">[\s\S]*?data-whose="opposer">by )[-+]?\d+(<\/span>)/;

/**
 * Rewrite the result line pf2e puts in a check card's flavor.
 * @param {string} html
 * @param {{ degree: number, label: string, margin: number }} result
 */
export function rewriteDegreeHtml(html, { degree, label, margin }) {
  if (!RESULT.test(html)) return html;
  const signed = margin >= 0 ? `+${margin}` : String(margin);
  return html
    .replace(RESULT, `$1${DEGREE_NAMES[degree]}$2${escapeHtml(label)}$3`)
    .replace(MARGIN, `$1${signed}$2`);
}
