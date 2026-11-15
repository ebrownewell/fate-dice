// @ts-check
// Turn a character's log into display rows, newest first.

/** @typedef {import("../core/log.js").LogEntry} LogEntry */

/**
 * @typedef {object} LogRow
 * @property {string} id
 * @property {string} time
 * @property {string} whatKey Localization key describing the entry.
 * @property {string | null} note
 * @property {string} delta "+1", "-2" or "0".
 * @property {number} after
 * @property {string | null} by Who made the change (null if they no longer exist).
 * @property {string | null} messageId Linked chat message, for rerolls.
 * @property {string | null} itemName The shop item or flaw, if any.
 * @property {boolean} refunded
 * @property {boolean} canRefund
 */

/** @param {LogEntry} entry */
function whatKey(entry) {
  if (entry.source?.type === "shop") return "FATEDICE.Log.Bought";
  if (entry.source?.type === "flaw") return "FATEDICE.Log.Flaw";
  if (entry.action === "spend") {
    return entry.source?.type === "reroll" ? "FATEDICE.Log.Reroll" : "FATEDICE.Log.Spend";
  }
  if (entry.action === "refund") {
    return entry.automatic ? "FATEDICE.Log.AutoRefund" : "FATEDICE.Log.Refund";
  }
  return entry.action === "award" ? "FATEDICE.Log.Award" : "FATEDICE.Log.Set";
}

/** Every key whatKey can return, for translation checks. */
export const LOG_LABEL_KEYS = [
  "FATEDICE.Log.Award",
  "FATEDICE.Log.Spend",
  "FATEDICE.Log.Reroll",
  "FATEDICE.Log.Set",
  "FATEDICE.Log.Refund",
  "FATEDICE.Log.AutoRefund",
  "FATEDICE.Log.Bought",
  "FATEDICE.Log.Flaw",
];

/**
 * @param {LogEntry[]} log Oldest first, as stored.
 * @param {object} options
 * @param {boolean} options.isGM
 * @param {(userId: string) => string | undefined} options.getUserName
 * @param {(time: number) => string} options.formatTime
 * @returns {LogRow[]}
 */
export function toLogRows(log, { isGM, getUserName, formatTime }) {
  // The log is stored oldest first, so reversing it is newest first even
  // when entries share a timestamp.
  return [...log].reverse().map((entry) => ({
    id: entry.id,
    time: formatTime(entry.time),
    whatKey: whatKey(entry),
    note: entry.reason ?? null,
    delta: entry.delta > 0 ? `+${entry.delta}` : String(entry.delta),
    after: entry.after,
    by: getUserName(entry.userId) ?? null,
    messageId: entry.source?.type === "reroll" ? entry.source.messageId : null,
    itemName:
      entry.source?.type === "shop" || entry.source?.type === "flaw" ? entry.source.name : null,
    refunded: Boolean(entry.refundedBy),
    canRefund: isGM && entry.action === "spend" && entry.delta < 0 && !entry.refundedBy,
  }));
}
