// @ts-check
// Whether a roll can be fated, and how its Fate Reroll button should look.
// System-agnostic: works on the RollInfo an adapter extracts.

import { MODULE_ID } from "./constants.js";

/**
 * @typedef {object} FateFlags
 * @property {string} [fatedBy] On an original roll: the id of its fated result message.
 * @property {string} [fatedFrom] On a fated result: the id of the original roll message.
 * @property {import("../rules/fateReroll.js").FateRerollResult} [outcome] On a fated result.
 * @property {{ before: import("../rules/deathSave.js").DeathState }} [deathSave] On a death save: the character before it.
 */

/**
 * @typedef {"disabled" | "not-d20" | "already-fated" | "is-fate-result" | "initiative-disabled" | "death-disabled" | "death-no-snapshot"} NotFateableReason
 */

/**
 * @param {any} message Chat message data.
 * @returns {FateFlags}
 */
export const getFateFlags = (message) => ({ ...message?.flags?.[MODULE_ID] });

/**
 * @param {object} input
 * @param {{ kind: string } | null} input.info From the system adapter; null if not a d20 roll.
 * @param {FateFlags} input.flags
 * @param {{ rerollEnabled: boolean, rerollOnInitiative: boolean, rerollOnDeathSaves: boolean }} input.settings
 * @returns {{ ok: true } | { ok: false, reason: NotFateableReason }}
 */
export function checkFateable({ info, flags, settings }) {
  /** @param {NotFateableReason} reason */
  const no = (reason) => /** @type {const} */ ({ ok: false, reason });
  if (!settings.rerollEnabled) return no("disabled");
  if (flags.fatedFrom) return no("is-fate-result");
  if (flags.fatedBy) return no("already-fated");
  if (!info) return no("not-d20");
  if (info.kind === "initiative" && !settings.rerollOnInitiative) return no("initiative-disabled");
  if (info.kind === "death") {
    if (!settings.rerollOnDeathSaves) return no("death-disabled");
    // Undoing the original's effect needs the character's state before it.
    if (!flags.deathSave?.before) return no("death-no-snapshot");
  }
  return { ok: true };
}

/**
 * @typedef {{ visible: false, fated?: true } | { visible: true, enabled: true } | { visible: true, enabled: false, reason: "insufficient-points" }} ButtonState
 */

/**
 * @param {object} input
 * @param {ReturnType<typeof checkFateable>} input.check
 * @param {boolean} input.isOwner Whether the viewer owns the rolling character (or is GM).
 * @param {number} input.points The character's current Fate Dice.
 * @param {number} input.cost
 * @returns {ButtonState}
 */
export function getButtonState({ check, isOwner, points, cost }) {
  if (!check.ok)
    return check.reason === "already-fated" ? { visible: false, fated: true } : { visible: false };
  if (!isOwner) return { visible: false };
  if (points < cost) return { visible: true, enabled: false, reason: "insufficient-points" };
  return { visible: true, enabled: true };
}
