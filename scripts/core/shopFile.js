// @ts-check
// Shop JSON files: export, parse (with validation), and merge.

import { SETTING_DEFINITIONS } from "./settings.js";
import { normalizeItem, validateItem } from "./shop.js";

/** @typedef {import("./shop.js").ShopItem} ShopItem */

export const SHOP_FORMAT = "fate-dice-shop";
export const SHOP_VERSION = 1;
const MAX_ITEMS = 500;

/**
 * @param {{ name: string, items: ShopItem[], settings?: Record<string, unknown> }} shop
 */
export function exportShop({ name, items, settings }) {
  return {
    format: SHOP_FORMAT,
    version: SHOP_VERSION,
    name,
    ...(settings ? { settings } : {}),
    items,
  };
}

/**
 * Check a setting value against its definition.
 * @param {any} def
 * @param {unknown} value
 */
function validSetting(def, value) {
  if (def.type === Boolean) return typeof value === "boolean";
  if (def.type !== Number || typeof value !== "number" || !Number.isInteger(value)) return false;
  return !def.range || (value >= def.range.min && value <= def.range.max);
}

/**
 * Parse and validate a shop file's text.
 * @param {string} text
 * @param {() => string} newId
 * @returns {{ ok: false, errors: string[] } | { ok: true, name: string, items: ShopItem[], settings?: Record<string, unknown>, warnings: string[] }}
 */
export function parseShopFile(text, newId) {
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This file isn't valid JSON."] };
  }
  if (data?.format !== SHOP_FORMAT) {
    return { ok: false, errors: ["This isn't a Fate Dice shop file."] };
  }
  if (!Number.isInteger(data.version) || data.version > SHOP_VERSION) {
    return {
      ok: false,
      errors: ["This file is from a newer version of Fate Dice. Update the module."],
    };
  }
  if (!Array.isArray(data.items)) return { ok: false, errors: ["The file has no item list."] };
  if (data.items.length > MAX_ITEMS) {
    return { ok: false, errors: [`A shop can have at most ${MAX_ITEMS} items.`] };
  }

  /** @type {string[]} */
  const warnings = [];
  /** @type {ShopItem[]} */
  const items = [];
  const seen = new Set();
  data.items.forEach((/** @type {unknown} */ raw, /** @type {number} */ index) => {
    const item = normalizeItem(raw, newId);
    const problems = validateItem(item);
    if (problems.length) {
      warnings.push(`Skipped item ${index + 1}: ${problems.join("; ")}`);
      return;
    }
    if (seen.has(item.id)) item.id = newId();
    seen.add(item.id);
    items.push(item);
  });

  /** @type {Record<string, unknown> | undefined} */
  let settings;
  if (data.settings && typeof data.settings === "object") {
    settings = {};
    for (const [key, value] of Object.entries(data.settings)) {
      const def = /** @type {Record<string, any>} */ (SETTING_DEFINITIONS)[key];
      if (!def) warnings.push(`Ignored unknown setting "${key}".`);
      else if (!validSetting(def, value)) warnings.push(`Ignored invalid value for "${key}".`);
      else settings[key] = value;
    }
  }

  return {
    ok: true,
    name: typeof data.name === "string" ? data.name : "",
    items,
    ...(settings ? { settings } : {}),
    warnings,
  };
}

/**
 * Combine an existing shop with imported items.
 * - "replace": only the imported items
 * - "update": imported items replace same-named ones (keeping their id); others are added
 * - "keep": same-named existing items stay as they are; others are added
 * @param {ShopItem[]} existing
 * @param {ShopItem[]} incoming
 * @param {"replace" | "update" | "keep"} mode
 * @returns {ShopItem[]}
 */
export function mergeShops(existing, incoming, mode) {
  if (mode === "replace") return incoming;
  const key = (/** @type {ShopItem} */ i) => i.name.trim().toLowerCase();
  const byName = new Map(incoming.map((i) => [key(i), i]));
  const result = existing.map((current) => {
    const match = byName.get(key(current));
    return match && mode === "update" ? { ...match, id: current.id } : current;
  });
  const names = new Set(existing.map(key));
  const ids = new Set(result.map((i) => i.id));
  for (const item of incoming) {
    if (names.has(key(item))) continue;
    let id = item.id;
    while (ids.has(id)) id = `${id}-copy`;
    ids.add(id);
    result.push({ ...item, id });
  }
  return result;
}
