// @ts-check
// The GM's Fate Dice panel: every player character's Fate Dice, quick
// awards, and the start-of-session award.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { selectParty } from "../core/party.js";
import { notifyError } from "../foundry/notify.js";
import { hudModel } from "../ui/hud.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** @type {GmPanelApp | null} */
let instance = null;

export class GmPanelApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fate-dice-gm-panel",
    classes: ["fate-dice", "fate-dice-panel-app"],
    window: { title: "FATEDICE.Panel.Title", icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 560, height: "auto" },
    actions: {
      sessionStart: GmPanelApp.#onSessionStart,
      plus: GmPanelApp.#onPlus,
      minus: GmPanelApp.#onMinus,
      award: GmPanelApp.#onAward,
      log: GmPanelApp.#onLog,
      editShop: GmPanelApp.#onEditShop,
    },
  };

  static PARTS = { panel: { template: `modules/${MODULE_ID}/templates/gm-panel.hbs` } };

  /** @param {{ api: any }} args @param {object} [options] */
  constructor({ api }, options = {}) {
    super(options);
    this.api = api;
  }

  static show(/** @type {any} */ api) {
    instance ??= new GmPanelApp({ api });
    return instance.render({ force: true });
  }

  static refresh() {
    if (instance?.rendered) instance.render();
  }

  /** Overrides ApplicationV2. */
  async _prepareContext() {
    const max = game.settings.get(MODULE_ID, "maxPoints");
    const rows = selectParty(game.actors).map((/** @type {any} */ actor) => {
      const points = getActorPoints(actor);
      const model = hudModel({ isGM: false, character: actor, points, max, show: true });
      return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        points,
        dots: model.visible && model.mode === "player" ? model.dots : [],
        owners: game.users
          .filter((/** @type {any} */ u) => !u.isGM && actor.testUserPermission(u, "OWNER"))
          .map((/** @type {any} */ u) => u.name)
          .join(", "),
      };
    });
    return { rows, max, session: game.settings.get(MODULE_ID, "session") };
  }

  /** @this {GmPanelApp} */
  static async #onSessionStart() {
    const party = selectParty(game.actors);
    await game.settings.set(MODULE_ID, "session", game.settings.get(MODULE_ID, "session") + 1);
    if (!party.length) return;
    const reason = game.i18n.localize("FATEDICE.Panel.SessionStartReason");
    const changes = await this.api.award(party, 1, reason).catch(notifyError);
    if (!changes) return;
    const gained = changes.filter((/** @type {any} */ c) => c.delta > 0).length;
    ui.notifications.info(
      game.i18n.format("FATEDICE.Panel.SessionStartDone", {
        gained,
        full: changes.length - gained,
      }),
    );
  }

  /** @this {GmPanelApp} */
  static async #onPlus(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    await this.api.award(target.dataset.actorId, 1).catch(notifyError);
  }

  /** @this {GmPanelApp} */
  static async #onMinus(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    const actor = game.actors.get(target.dataset.actorId);
    const points = getActorPoints(actor);
    if (points > 0) await this.api.setPoints(actor, points - 1).catch(notifyError);
  }

  /** @this {GmPanelApp} */
  static async #onAward(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    const actor = game.actors.get(target.dataset.actorId);
    const result = await DialogV2.prompt({
      window: {
        title: game.i18n.format("FATEDICE.Panel.AwardTitle", { name: actor.name }),
      },
      content: `
        <div class="form-group"><label>${game.i18n.localize("FATEDICE.Panel.Amount")}</label>
          <input type="number" name="amount" value="1" min="1" step="1"></div>
        <div class="form-group"><label>${game.i18n.localize("FATEDICE.Panel.Note")}</label>
          <input type="text" name="reason"></div>`,
      ok: {
        callback: (/** @type {Event} */ _e, /** @type {any} */ button) => ({
          amount: button.form.elements.amount.valueAsNumber,
          reason: button.form.elements.reason.value,
        }),
      },
      rejectClose: false,
    });
    if (!result) return;
    await this.api.award(actor, result.amount, result.reason).catch(notifyError);
  }

  /** @this {GmPanelApp} */
  static #onEditShop() {
    this.api.openShopEditor();
  }

  /** @this {GmPanelApp} */
  static #onLog(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    this.api.openLog(game.actors.get(target.dataset.actorId));
  }

  /** Overrides ApplicationV2. */
  _onClose(/** @type {any} */ options) {
    super._onClose(options);
    instance = null;
  }
}
