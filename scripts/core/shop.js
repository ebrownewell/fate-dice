// @ts-check
// Shop items and the rules for buying them. Pure: works on plain data.

/** @typedef {import("./log.js").LogEntry} LogEntry */

/**
 * @typedef {object} ShopItem
 * @property {string} id
 * @property {string} name
 * @property {string} description Plain text (never rendered as HTML).
 * @property {number} cost For a flaw, the Fate Dice it grants.
 * @property {"purchase" | "flaw"} kind
 * @property {number} costStep Extra cost for each earlier purchase (0 = fixed price).
 * @property {"session" | "campaign"} costStepPer When the extra cost resets.
 * @property {{ count: number | null, per: "session" | "campaign" }} limit
 * @property {boolean} requiresNote
 * @property {boolean} enabled
 */

const PERIODS = ["session", "campaign"];
const KINDS = ["purchase", "flaw"];

/** @param {unknown} n @param {number} min @param {number} max */
const isWhole = (n, min, max) =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/**
 * Every problem with an item. Empty means valid.
 * @param {any} item
 * @returns {string[]}
 */
export function validateItem(item) {
  const errors = [];
  const name = typeof item?.name === "string" ? item.name.trim() : "";
  if (!name || name.length > 100) errors.push("name must be 1–100 characters");
  if (typeof item?.description !== "string" || item.description.length > 2000) {
    errors.push("description must be text of at most 2000 characters");
  }
  if (!isWhole(item?.cost, 0, 99)) errors.push("cost must be a whole number from 0 to 99");
  if (!KINDS.includes(item?.kind)) errors.push('kind must be "purchase" or "flaw"');
  if (!isWhole(item?.costStep, 0, 99)) errors.push("costStep must be a whole number from 0 to 99");
  if (!PERIODS.includes(item?.costStepPer))
    errors.push('costStepPer must be "session" or "campaign"');
  const limit = item?.limit;
  if (
    !limit ||
    !PERIODS.includes(limit.per) ||
    !(limit.count === null || isWhole(limit.count, 1, 99))
  ) {
    errors.push("limit must have a count of 1–99 (or none) per session or campaign");
  }
  if (typeof item?.requiresNote !== "boolean") errors.push("requiresNote must be true or false");
  if (typeof item?.enabled !== "boolean") errors.push("enabled must be true or false");
  return errors;
}

/**
 * Fill in defaults and drop unknown fields. Does not validate.
 * @param {any} raw
 * @param {() => string} newId
 * @returns {ShopItem}
 */
export function normalizeItem(raw, newId) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : newId(),
    name: typeof raw?.name === "string" ? raw.name.trim() : raw?.name,
    description: raw?.description ?? "",
    cost: raw?.cost,
    kind: raw?.kind ?? "purchase",
    costStep: raw?.costStep ?? 0,
    costStepPer: raw?.costStepPer ?? "campaign",
    limit: {
      count: raw?.limit?.count ?? null,
      per: raw?.limit?.per ?? "session",
    },
    requiresNote: raw?.requiresNote ?? false,
    enabled: raw?.enabled ?? true,
  };
}

/**
 * How many times a character has bought (or taken) an item, not counting refunds.
 * @param {LogEntry[]} log
 * @param {string} itemId
 * @param {{ per: "session" | "campaign", session: number }} period
 */
export function countPurchases(log, itemId, { per, session }) {
  return log.filter(
    (e) =>
      (e.source?.type === "shop" || e.source?.type === "flaw") &&
      e.source.itemId === itemId &&
      !e.refundedBy &&
      (per === "campaign" || e.session === session),
  ).length;
}

/**
 * The price right now, including any increase for earlier purchases.
 * @param {ShopItem} item
 * @param {LogEntry[]} log
 * @param {number} session
 */
export const currentCost = (item, log, session) =>
  item.cost + item.costStep * countPurchases(log, item.id, { per: item.costStepPer, session });

/**
 * Whether a character can buy an item now, and what it costs or grants.
 * @param {{ item: ShopItem, points: number, max: number, session: number, log: LogEntry[], note: string }} input
 * @returns {{ ok: true, cost: number, gain: number } | { ok: false, code: "not-found" | "note-required" | "limit-reached" | "insufficient-points" | "at-max" }}
 */
export function checkPurchase({ item, points, max, session, log, note }) {
  if (!item.enabled) return { ok: false, code: "not-found" };
  if (item.requiresNote && !note.trim()) return { ok: false, code: "note-required" };
  if (
    item.limit.count !== null &&
    countPurchases(log, item.id, { per: item.limit.per, session }) >= item.limit.count
  ) {
    return { ok: false, code: "limit-reached" };
  }
  const price = currentCost(item, log, session);
  if (item.kind === "flaw") {
    const gain = Math.min(price, max - points);
    return gain > 0 ? { ok: true, cost: 0, gain } : { ok: false, code: "at-max" };
  }
  return price <= points
    ? { ok: true, cost: price, gain: 0 }
    : { ok: false, code: "insufficient-points" };
}
