// @ts-check
// The GM's shop editor: add, edit, reorder and remove items, adjust the
// built-in Fate Reroll, and import/export the shop as JSON.

import { MODULE_ID } from "../core/constants.js";
import { SETTING_DEFINITIONS, readSettings } from "../core/settings.js";
import { exportShop, mergeShops, parseShopFile } from "../core/shopFile.js";
import { normalizeItem } from "../core/shop.js";
import { escapeHtml } from "../ui/purchaseMessage.js";
import { itemFromForm, itemToForm, summarizeImport } from "../ui/shopForms.js";
import { getShopItems } from "./ShopApp.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** @param {import("../core/shop.js").ShopItem[]} items */
const saveItems = (items) => game.settings.set(MODULE_ID, "shop", { items });

const t = (/** @type {string} */ key, /** @type {object} */ data = {}) =>
  game.i18n.format(key, data);

/** Ask the user for a file and read it as text. */
function pickFileText() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () =>
      resolve(input.files?.[0] ? await input.files[0].text() : null),
    );
    input.click();
  });
}

export class ShopEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fate-dice-shop-editor",
    classes: ["fate-dice", "fate-dice-shop-editor-app"],
    window: { title: "FATEDICE.Editor.Title", icon: "fa-solid fa-store", resizable: true },
    position: { width: 680, height: 560 },
    actions: {
      add: ShopEditorApp.#onAdd,
      edit: ShopEditorApp.#onEdit,
      delete: ShopEditorApp.#onDelete,
      up: ShopEditorApp.#onUp,
      down: ShopEditorApp.#onDown,
      toggle: ShopEditorApp.#onToggle,
      toggleReroll: ShopEditorApp.#onToggleReroll,
      editReroll: ShopEditorApp.#onEditReroll,
      import: ShopEditorApp.#onImport,
      export: ShopEditorApp.#onExport,
      example: ShopEditorApp.#onExample,
    },
  };

  static PARTS = {
    editor: {
      template: `modules/${MODULE_ID}/templates/shop-editor.hbs`,
      scrollable: [".fate-dice-editor-table"],
    },
  };

  static refresh() {
    const app = foundry.applications.instances.get("fate-dice-shop-editor");
    if (app?.rendered) app.render();
  }

  /** Overrides ApplicationV2. */
  async _prepareContext() {
    const items = getShopItems().map((item) => {
      const rules = [];
      if (item.limit.count !== null) {
        rules.push(t(`FATEDICE.Editor.LimitRule.${item.limit.per}`, { count: item.limit.count }));
      }
      if (item.costStep)
        rules.push(t(`FATEDICE.Editor.StepRule.${item.costStepPer}`, { step: item.costStep }));
      if (item.requiresNote) rules.push(t("FATEDICE.Editor.NoteRule"));
      return { ...item, flaw: item.kind === "flaw", rules: rules.join(" · ") };
    });
    return {
      items,
      reroll: {
        enabled: game.settings.get(MODULE_ID, "rerollEnabled"),
        cost: game.settings.get(MODULE_ID, "rerollCost"),
      },
    };
  }

  /** Show the item form; returns the saved item, or null if cancelled. */
  static async editItemDialog(/** @type {any} */ item) {
    const f = itemToForm(item);
    const sel = (/** @type {string} */ value, /** @type {string} */ current) =>
      value === current ? "selected" : "";
    const content = `
      <div class="form-group"><label>${t("FATEDICE.Editor.Name")}</label>
        <input type="text" name="name" value="${escapeHtml(f.name)}" maxlength="100" required></div>
      <div class="form-group stacked"><label>${t("FATEDICE.Editor.Description")}</label>
        <textarea name="description" rows="3" maxlength="2000">${escapeHtml(f.description)}</textarea></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.Kind")}</label>
        <select name="kind">
          <option value="purchase" ${sel("purchase", f.kind)}>${t("FATEDICE.Editor.KindPurchase")}</option>
          <option value="flaw" ${sel("flaw", f.kind)}>${t("FATEDICE.Editor.KindFlaw")}</option>
        </select></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.Cost")}</label>
        <input type="number" name="cost" value="${f.cost}" min="0" max="99" step="1"></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.CostStep")}</label>
        <input type="number" name="costStep" value="${f.costStep}" min="0" max="99" step="1">
        <select name="costStepPer">
          <option value="session" ${sel("session", f.costStepPer)}>${t("FATEDICE.Editor.ResetsSession")}</option>
          <option value="campaign" ${sel("campaign", f.costStepPer)}>${t("FATEDICE.Editor.ResetsNever")}</option>
        </select></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.Limit")}</label>
        <input type="number" name="limitCount" value="${f.limitCount}" min="1" max="99" step="1" placeholder="${t("FATEDICE.Editor.NoLimit")}">
        <select name="limitPer">
          <option value="session" ${sel("session", f.limitPer)}>${t("FATEDICE.Editor.PerSession")}</option>
          <option value="campaign" ${sel("campaign", f.limitPer)}>${t("FATEDICE.Editor.PerCampaign")}</option>
        </select></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.RequiresNote")}</label>
        <input type="checkbox" name="requiresNote" ${f.requiresNote ? "checked" : ""}></div>
      <div class="form-group"><label>${t("FATEDICE.Editor.On")}</label>
        <input type="checkbox" name="enabled" ${f.enabled ? "checked" : ""}></div>`;
    const values = await DialogV2.prompt({
      window: { title: item.name || t("FATEDICE.Editor.Add") },
      position: { width: 460 },
      content,
      ok: {
        label: t("FATEDICE.Editor.Save"),
        callback: (/** @type {Event} */ _e, /** @type {any} */ button) =>
          new foundry.applications.ux.FormDataExtended(button.form).object,
      },
      rejectClose: false,
    });
    if (!values) return null;
    const result = itemFromForm(values, item.id);
    if (!result.ok) {
      ui.notifications.error(result.errors.join("; "));
      return null;
    }
    return result.item;
  }

  static async #onAdd() {
    const blank = normalizeItem({ name: "", cost: 1 }, () => foundry.utils.randomID());
    const item = await ShopEditorApp.editItemDialog(blank);
    if (item) await saveItems([...getShopItems(), item]);
  }

  static async #onEdit(/** @type {Event} */ _e, /** @type {HTMLElement} */ target) {
    const items = getShopItems();
    const current = items.find((i) => i.id === target.dataset.itemId);
    if (!current) return;
    const item = await ShopEditorApp.editItemDialog(current);
    if (item) await saveItems(items.map((i) => (i.id === item.id ? item : i)));
  }

  static async #onDelete(/** @type {Event} */ _e, /** @type {HTMLElement} */ target) {
    const items = getShopItems();
    const item = items.find((i) => i.id === target.dataset.itemId);
    if (!item) return;
    const yes = await DialogV2.confirm({
      window: { title: t("FATEDICE.Editor.DeleteTitle") },
      content: `<p>${t("FATEDICE.Editor.DeleteConfirm", { name: escapeHtml(item.name) })}</p>`,
    });
    if (yes) await saveItems(items.filter((i) => i.id !== item.id));
  }

  /** @param {string | undefined} id @param {-1 | 1} direction */
  static async #move(id, direction) {
    const items = [...getShopItems()];
    const from = items.findIndex((i) => i.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to], items[from]];
    await saveItems(items);
  }

  static #onUp(/** @type {Event} */ _e, /** @type {HTMLElement} */ target) {
    return ShopEditorApp.#move(target.dataset.itemId, -1);
  }

  static #onDown(/** @type {Event} */ _e, /** @type {HTMLElement} */ target) {
    return ShopEditorApp.#move(target.dataset.itemId, 1);
  }

  static async #onToggle(/** @type {Event} */ _e, /** @type {HTMLInputElement} */ target) {
    const items = getShopItems().map((i) =>
      i.id === target.dataset.itemId ? { ...i, enabled: target.checked } : i,
    );
    await saveItems(items);
  }

  static async #onToggleReroll(/** @type {Event} */ _e, /** @type {HTMLInputElement} */ target) {
    await game.settings.set(MODULE_ID, "rerollEnabled", target.checked);
  }

  static async #onEditReroll() {
    const cost = game.settings.get(MODULE_ID, "rerollCost");
    const value = await DialogV2.prompt({
      window: { title: t("FATEDICE.Chat.FateReroll") },
      content: `<div class="form-group"><label>${t("FATEDICE.Editor.Cost")}</label>
        <input type="number" name="cost" value="${cost}" min="0" max="10" step="1"></div>
        <p class="hint">${t("FATEDICE.Editor.RerollMore")}</p>`,
      ok: {
        callback: (/** @type {Event} */ _e, /** @type {any} */ button) =>
          button.form.elements.cost.valueAsNumber,
      },
      rejectClose: false,
    });
    if (Number.isInteger(value) && value >= 0 && value <= 10) {
      await game.settings.set(MODULE_ID, "rerollCost", value);
    }
  }

  static async #onImport() {
    const text = await pickFileText();
    if (text) await ShopEditorApp.importText(/** @type {string} */ (text));
  }

  static async #onExample() {
    const response = await fetch(`modules/${MODULE_ID}/examples/default-shop.json`);
    await ShopEditorApp.importText(await response.text());
  }

  /** Preview a shop file and apply it if the GM confirms. */
  static async importText(/** @type {string} */ text) {
    const parsed = parseShopFile(text, () => foundry.utils.randomID());
    if (!parsed.ok) return ui.notifications.error(parsed.errors.join(" "));
    const existing = getShopItems();
    const summary = summarizeImport(existing, parsed);
    const warnings = summary.warnings.length
      ? `<p>${t("FATEDICE.Editor.ImportWarnings")}</p><ul>${summary.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : "";
    const settings = summary.hasSettings
      ? `<div class="form-group"><label>${t("FATEDICE.Editor.ImportSettings")}</label>
          <input type="checkbox" name="applySettings"></div>`
      : "";
    const choice = await DialogV2.prompt({
      window: { title: t("FATEDICE.Editor.ImportTitle") },
      position: { width: 460 },
      content: `<p>${t("FATEDICE.Editor.ImportSummary", {
        name: escapeHtml(parsed.name || "?"),
        total: summary.total,
        added: summary.added,
        duplicates: summary.duplicates,
      })}</p>${warnings}
        <div class="form-group"><label>${t("FATEDICE.Editor.ImportMode")}</label>
          <select name="mode">
            <option value="update">${t("FATEDICE.Editor.ModeUpdate")}</option>
            <option value="keep">${t("FATEDICE.Editor.ModeKeep")}</option>
            <option value="replace">${t("FATEDICE.Editor.ModeReplace")}</option>
          </select></div>${settings}`,
      ok: {
        label: t("FATEDICE.Editor.Import"),
        callback: (/** @type {Event} */ _e, /** @type {any} */ button) => ({
          mode: button.form.elements.mode.value,
          applySettings: Boolean(button.form.elements.applySettings?.checked),
        }),
      },
      rejectClose: false,
    });
    if (!choice) return;
    await saveItems(mergeShops(existing, parsed.items, choice.mode));
    if (choice.applySettings && parsed.settings) {
      for (const [key, value] of Object.entries(parsed.settings)) {
        await game.settings.set(MODULE_ID, key, value);
      }
    }
    ui.notifications.info(t("FATEDICE.Editor.Imported", { count: summary.total }));
  }

  static async #onExport() {
    const includeSettings = await DialogV2.confirm({
      window: { title: t("FATEDICE.Editor.Export") },
      content: `<p>${t("FATEDICE.Editor.ExportSettings")}</p>`,
      rejectClose: false,
    });
    if (includeSettings === null) return;
    const all = readSettings(game.settings, MODULE_ID);
    const settings = Object.fromEntries(
      Object.keys(SETTING_DEFINITIONS).map((k) => [k, /** @type {any} */ (all)[k]]),
    );
    const file = exportShop({
      name: game.world.title,
      items: getShopItems(),
      ...(includeSettings ? { settings } : {}),
    });
    foundry.utils.saveDataToFile(
      JSON.stringify(file, null, 2),
      "application/json",
      "fate-dice-shop.json",
    );
  }
}
