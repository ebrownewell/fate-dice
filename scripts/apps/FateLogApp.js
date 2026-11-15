// @ts-check
// A character's Fate Dice log window. Thin: rows come from ui/logRows.js.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { getActorLog } from "../core/log.js";
import { notifyError } from "../foundry/notify.js";
import { toLogRows } from "../ui/logRows.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Open windows by actor id, so each character has at most one. */
const open = new Map();

export class FateLogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["fate-dice", "fate-dice-log-app"],
    window: { icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 620, height: 460 },
    actions: {
      refund: FateLogApp.#onRefund,
      viewRoll: FateLogApp.#onViewRoll,
    },
  };

  static PARTS = {
    log: {
      template: `modules/${MODULE_ID}/templates/log.hbs`,
      scrollable: [".fate-dice-log-table"],
    },
  };

  /**
   * @param {{ actor: any, api: any }} args
   * @param {object} [options]
   */
  constructor({ actor, api }, options = {}) {
    super({ id: `fate-dice-log-${actor.id}`, ...options });
    this.actor = actor;
    this.api = api;
  }

  get title() {
    return game.i18n.format("FATEDICE.Log.Title", { name: this.actor.name });
  }

  /** Open (or bring forward) the log for an actor. */
  static show(/** @type {any} */ actor, /** @type {any} */ api) {
    const app = open.get(actor.id) ?? new FateLogApp({ actor, api });
    open.set(actor.id, app);
    return app.render({ force: true });
  }

  /** Re-render an actor's open log, e.g. after its Fate Dice change. */
  static refresh(/** @type {string} */ actorId) {
    const app = open.get(actorId);
    if (app?.rendered) app.render();
  }

  /** Overrides ApplicationV2. */
  async _prepareContext() {
    const rows = toLogRows(getActorLog(this.actor), {
      isGM: game.user.isGM,
      getUserName: (id) => game.users.get(id)?.name,
      formatTime: (time) =>
        new Date(time).toLocaleString(game.i18n.lang, { dateStyle: "medium", timeStyle: "short" }),
    });
    const unknown = game.i18n.localize("FATEDICE.Log.Unknown");
    return {
      points: getActorPoints(this.actor),
      max: game.settings.get(MODULE_ID, "maxPoints"),
      isGM: game.user.isGM,
      rows: rows.map((row) => ({
        ...row,
        what: game.i18n.localize(row.whatKey),
        by: row.by ?? unknown,
      })),
    };
  }

  /** Overrides ApplicationV2. */
  _onClose(/** @type {any} */ options) {
    super._onClose(options);
    open.delete(this.actor.id);
  }

  /** @this {FateLogApp} */
  static async #onRefund(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    const entryId = target.dataset.entryId;
    const entry = getActorLog(this.actor).find((e) => e.id === entryId);
    if (!entry) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("FATEDICE.Log.RefundTitle") },
      content: `<p>${game.i18n.format("FATEDICE.Log.RefundConfirm", {
        amount: -entry.delta,
        name: foundry.utils.escapeHTML(this.actor.name),
      })}</p>`,
    });
    if (!confirmed) return;
    await this.api.refundEntry(this.actor, entryId).catch(notifyError);
  }

  /** @this {FateLogApp} */
  static #onViewRoll(/** @type {Event} */ _event, /** @type {HTMLElement} */ target) {
    const message = game.messages.get(target.dataset.messageId);
    if (!message) return ui.notifications.info(game.i18n.localize("FATEDICE.Log.MessageGone"));
    new foundry.applications.sidebar.apps.ChatPopout({ message }).render({ force: true });
  }
}
