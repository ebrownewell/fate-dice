// @ts-check
// Conversions between shop items and the editor's form, and the import preview.

import { validateItem } from "../core/shop.js";

/** @typedef {import("../core/shop.js").ShopItem} ShopItem */

/**
 * @typedef {object} ItemForm
 * @property {string} name
 * @property {string} description
 * @property {string} kind
 * @property {string} cost
 * @property {string} costStep
 * @property {string} costStepPer
 * @property {string} limitCount Blank for no limit.
 * @property {string} limitPer
 * @property {boolean} requiresNote
 * @property {boolean} enabled
 */

/** @param {ShopItem} item @returns {ItemForm} */
export const itemToForm = (item) => ({
  name: item.name,
  description: item.description,
  kind: item.kind,
  cost: String(item.cost),
  costStep: String(item.costStep),
  costStepPer: item.costStepPer,
  limitCount: item.limit.count === null ? "" : String(item.limit.count),
  limitPer: item.limit.per,
  requiresNote: item.requiresNote,
  enabled: item.enabled,
});

/** Blank → fallback; otherwise a number (NaN if not numeric, which validation rejects). */
const toNumber = (/** @type {unknown} */ value, /** @type {number | null} */ fallback) => {
  const text = String(value ?? "").trim();
  return text === "" ? fallback : Number(text);
};

/**
 * @param {Partial<Record<keyof ItemForm, unknown>>} form
 * @param {string} id
 * @returns {{ ok: true, item: ShopItem } | { ok: false, errors: string[] }}
 */
export function itemFromForm(form, id) {
  /** @type {any} */
  const item = {
    id,
    name: String(form.name ?? "").trim(),
    description: String(form.description ?? ""),
    cost: toNumber(form.cost, 0),
    kind: form.kind,
    costStep: toNumber(form.costStep, 0),
    costStepPer: form.costStepPer,
    limit: { count: toNumber(form.limitCount, null), per: form.limitPer },
    requiresNote: Boolean(form.requiresNote),
    enabled: Boolean(form.enabled),
  };
  const errors = validateItem(item);
  return errors.length ? { ok: false, errors } : { ok: true, item };
}

/**
 * What an import will do, for the preview.
 * @param {ShopItem[]} existing
 * @param {{ items: ShopItem[], settings?: object, warnings: string[] }} parsed
 */
export function summarizeImport(existing, parsed) {
  const names = new Set(existing.map((i) => i.name.trim().toLowerCase()));
  const duplicates = parsed.items.filter((i) => names.has(i.name.trim().toLowerCase())).length;
  return {
    total: parsed.items.length,
    added: parsed.items.length - duplicates,
    duplicates,
    hasSettings: Boolean(parsed.settings),
    warnings: parsed.warnings,
  };
}
