// @ts-check
// Per-character Fate Dice log. Entries live in an actor flag, oldest first,
// and are written in the same update as the point change they record.

import { MODULE_ID } from "./constants.js";
import { FateError } from "./errors.js";

/** @typedef {import("./types.js").PointChange} PointChange */

/** @typedef {"award" | "spend" | "set" | "refund"} LogAction */

/**
 * @typedef {object} LogEntry
 * @property {string} id
 * @property {number} time Milliseconds since the epoch.
 * @property {LogAction} action
 * @property {number} before
 * @property {number} after
 * @property {number} delta
 * @property {string} userId Who made the change.
 * @property {string} [reason] A note, e.g. why the GM awarded it.
 * @property {number} [session] The session number when it happened.
 * @property {{ type: "reroll", messageId: string } | { type: "shop" | "flaw", itemId: string, name: string }} [source]
 *   What the points were spent on (or, for a flaw, gained from).
 * @property {string} [refundOf] On a refund: the spend it refunds.
 * @property {string} [refundedBy] On a spend: the refund that undid it.
 * @property {true} [automatic] On a refund made automatically after a failure.
 */

export const LOG_FLAG = "log";

/**
 * @param {object} input
 * @param {string} input.id
 * @param {number} input.time
 * @param {LogAction} input.action
 * @param {PointChange} input.change
 * @param {string} input.userId
 * @param {string} [input.reason]
 * @param {LogEntry["source"]} [input.source]
 * @param {number} [input.session]
 * @returns {LogEntry}
 */
export function createLogEntry({ id, time, action, change, userId, reason, source, session }) {
  /** @type {LogEntry} */
  const entry = {
    id,
    time,
    action,
    before: change.before,
    after: change.after,
    delta: change.delta,
    userId,
  };
  if (typeof reason === "string" && reason.trim()) entry.reason = reason.trim();
  if (source) entry.source = source;
  if (typeof session === "number") entry.session = session;
  return entry;
}

/**
 * A character's log, oldest first. Missing or corrupt logs read as empty.
 * @param {{ getFlag: (scope: string, key: string) => unknown }} actor
 * @returns {LogEntry[]}
 */
export function getActorLog(actor) {
  const log = actor.getFlag(MODULE_ID, LOG_FLAG);
  return Array.isArray(log) ? log : [];
}

/**
 * The spend a refund will undo. Refuses unknown, non-spend and already-refunded entries.
 * @param {LogEntry[]} log
 * @param {string} entryId
 */
export function findRefundableSpend(log, entryId) {
  const entry = log.find((e) => e.id === entryId);
  if (!entry) throw new FateError("not-found", "That log entry doesn't exist");
  if (entry.action !== "spend" || entry.delta >= 0) {
    throw new FateError("invalid", "Only spends can be refunded");
  }
  if (entry.refundedBy) throw new FateError("invalid", "That spend was already refunded");
  return entry;
}

/**
 * Link a spend to the refund that undid it. Returns a new list.
 * @param {LogEntry[]} log
 * @param {string} entryId
 * @param {string} refundId
 */
export const markRefunded = (log, entryId, refundId) =>
  log.map((e) => (e.id === entryId ? { ...e, refundedBy: refundId } : e));
