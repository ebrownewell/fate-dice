// @ts-check
// A character's Fate Dice shop: what they can spend Fate Dice on (or gain
// them from), with the built-in Fate Reroll listed for reference.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { getActorLog } from "../core/log.js";
import { checkPurchase, currentCost, countPurchases } from "../core/shop.js";
import { notifyError } from "../foundry/notify.js";
import { hudModel } from "../ui/hud.js";
import { escapeHtml } from "../ui/purchaseMessage.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** @type {Map<string, ShopApp>} */
const open = new Map();

/** @returns {import("../core/shop.js").ShopItem[]} */
export const getShopItems = () => game.settings.get(MODULE_ID, "shop")?.items ?? [];

export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["fate-dice", "fate-dice-shop-app"],
    window: { icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 480, height: 560 },
    actions: { buy: ShopApp.#onBuy, history: ShopApp.#onHistory },
  };

  static PARTS = {
    shop: {
      template: `modules/${MODULE_ID}/templates/shop.hbs`,
      scrollable: [".fate-dice-shop-items"],
    },
  };

  /** @param {{ actor: any, api: any }} args @param {object} [options] */
  constructor({ actor, api }, options = {}) {
    super({ id: `fate-dice-shop-${actor.id}`, ...options });
    this.actor = actor;
    this.api = api;
  }

  get title() {
    return game.i18n.format("FATEDICE.Shop.Title", { name: this.actor.name });
  }

  static show(/** @type {any} */ actor, /** @type {any} */ api) {
    const app = open.get(actor.id) ?? new ShopApp({ actor, api });
    open.set(actor.id, app);
    return app.render({ force: true });
  }

  /** Re-render open shops (all, or one actor's). */
  static refresh(/** @type {string} */ actorId = "") {
    for (const [id, app] of open) if ((!actorId || id === actorId) && app.rendered) app.render();
  }

  /** Overrides ApplicationV2. */
  async _prepareContext() {
    const points = getActorPoints(this.actor);
    const max = game.settings.get(MODULE_ID, "maxPoints");
    const session = game.settings.get(MODULE_ID, "session");
    const log = getActorLog(this.actor);
    const model = hudModel({ isGM: false, character: this.actor, points, max, show: true });
    const items = getShopItems()
      .filter((item) => item.enabled)
      .map((item) => {
        // Availability ignores the note, which is asked for when buying.
        const check = checkPurchase({ item, points, max, session, log, note: "-" });
        const used =
          item.limit.count === null
            ? 0
            : countPurchases(log, item.id, { per: item.limit.per, session });
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          flaw: item.kind === "flaw",
          price: currentCost(item, log, session),
          available: check.ok,
          reason: check.ok ? "" : game.i18n.localize(`FATEDICE.Errors.${check.code}`),
          limitText:
            item.limit.count === null
              ? ""
              : game.i18n.format(`FATEDICE.Shop.Limit.${item.limit.per}`, {
                  used,
                  count: item.limit.count,
                }),
        };
      });
    return {
      points,
      max,
      dots: model.visible && model.mode === "player" ? model.dots : [],
      items,
      reroll: game.settings.get(MODULE_ID, "rerollEnabled")
        ? { cost: game.settings.get(MODULE_ID, "rerollCost") }
        : null,
    };
  }

  /** Overrides ApplicationV2. */
  _onClose(/** @type {any} */ options) {
    super._onClose(options);
    open.delete(this.actor.id);
  }

  /** @this {ShopApp} */
  static async #onBuy(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    const item = getShopItems().find((i) => i.id === target.dataset.itemId);
    if (!item) return;
    const session = game.settings.get(MODULE_ID, "session");
    const price = currentCost(item, getActorLog(this.actor), session);
    const question = game.i18n.format(
      item.kind === "flaw" ? "FATEDICE.Shop.ConfirmFlaw" : "FATEDICE.Shop.ConfirmBuy",
      {
        amount: price,
        name: escapeHtml(item.name),
      },
    );
    const noteLabel = game.i18n.localize(
      item.requiresNote ? "FATEDICE.Shop.NoteRequired" : "FATEDICE.Shop.NoteOptional",
    );
    const note = await DialogV2.prompt({
      window: { title: item.name },
      content: `<p>${question}</p>
        <div class="form-group stacked"><label>${noteLabel}</label>
        <textarea name="note" rows="3"></textarea></div>`,
      ok: {
        label: game.i18n.localize(
          item.kind === "flaw" ? "FATEDICE.Shop.Take" : "FATEDICE.Shop.Buy",
        ),
        callback: (/** @type {Event} */ _e, /** @type {any} */ button) =>
          button.form.elements.note.value,
      },
      rejectClose: false,
    });
    if (note === null || note === undefined) return;
    await this.api.purchase(this.actor, item.id, note).catch(notifyError);
  }

  /** @this {ShopApp} */
  static #onHistory() {
    this.api.openLog(this.actor);
  }
}
