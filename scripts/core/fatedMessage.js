// @ts-check
// Build the chat message data for a fated roll from the original message.

import { MODULE_ID } from "./constants.js";

/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */

/**
 * @param {object} input
 * @param {any} input.original The original message's data (ChatMessage#toObject()).
 * @param {any} input.rollData The fated roll's data.
 * @param {FateRerollResult} input.outcome
 * @param {string} input.userId The player who spent the Fate Die.
 * @param {string} input.flavorSuffix Localized "Fate Reroll" label.
 */
export function buildFatedMessageData({ original, rollData, outcome, userId, flavorSuffix }) {
  const rest = structuredClone(original);
  const _id = rest._id;
  // A new message: drop the original's identity and bookkeeping.
  for (const key of ["_id", "timestamp", "_stats"]) delete rest[key];
  const originalTotal = JSON.parse(original.rolls[0]).total;
  const flags = { ...rest.flags };
  // The original total is shown on the fated card, to help match the two up.
  flags[MODULE_ID] = { fatedFrom: _id, outcome, originalTotal };

  return {
    ...rest,
    author: userId,
    rolls: [JSON.stringify(rollData)],
    flags,
    flavor: rest.flavor ? `${rest.flavor} (${flavorSuffix})` : flavorSuffix,
    content: rest.content === String(originalTotal) ? String(rollData.total) : rest.content,
  };
}
