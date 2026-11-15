// @ts-check
import { dnd5eAdapter } from "./dnd5e.js";

/** @typedef {import("../core/fateRerollHandler.js").SystemAdapter} SystemAdapter */

/** @type {Record<string, SystemAdapter>} */
const ADAPTERS = { dnd5e: dnd5eAdapter };

/**
 * The adapter for a game system, or null if Fate Reroll doesn't support it yet.
 * @param {string} systemId
 * @returns {SystemAdapter | null}
 */
export const getSystemAdapter = (systemId) =>
  Object.hasOwn(ADAPTERS, systemId) ? ADAPTERS[systemId] : null;
