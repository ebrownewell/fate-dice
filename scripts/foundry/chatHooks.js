// @ts-check
// Adds the Fate Reroll button and the fated-result banner to chat cards.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { checkFateable, getButtonState, getFateFlags } from "../core/fateRerollPolicy.js";
import { getRollTargets } from "../core/rollTargets.js";
import { readSettings } from "../core/settings.js";
import { getSystemAdapter } from "../systems/index.js";
import { addFateBanner, addFateControls } from "../ui/chatCard.js";
import { notifyError } from "./notify.js";

/** Localization keys used on chat cards. */
export const CHAT_LABEL_KEYS = {
  reroll: "FATEDICE.Chat.Reroll",
  fated: "FATEDICE.Chat.Fated",
  banner: "FATEDICE.Chat.FateReroll",
  kept: "FATEDICE.Chat.Kept",
  notKept: "FATEDICE.Chat.NotKept",
};

/** @returns {import("../ui/chatCard.js").ChatCardLabels} */
function labels() {
  const text = /** @type {Record<keyof typeof CHAT_LABEL_KEYS, string>} */ (
    Object.fromEntries(
      Object.entries(CHAT_LABEL_KEYS).map(([k, key]) => [k, game.i18n.localize(key)]),
    )
  );
  return {
    ...text,
    reasons: { "insufficient-points": game.i18n.localize("FATEDICE.Errors.insufficient-points") },
  };
}

/**
 * @param {{ bus: { request: (action: string, payload: unknown) => Promise<any> } }} deps
 */
export function registerChatHooks({ bus }) {
  Hooks.on(
    "renderChatMessageHTML",
    (/** @type {any} */ message, /** @type {HTMLElement} */ html) => {
      const data = message.toObject();
      const flags = getFateFlags(data);
      if (flags.fatedFrom && flags.outcome) addFateBanner(html, flags.outcome, labels());

      const settings = readSettings(game.settings, MODULE_ID);
      const adapter = /** @type {any} */ (getSystemAdapter(game.system.id));
      for (const { target, info } of getRollTargets(adapter, data)) {
        const actor = game.actors.get(info.actorId);
        const state = getButtonState({
          check: checkFateable({ info, flags, settings, target }),
          isOwner: Boolean(actor?.isOwner),
          points: actor ? getActorPoints(actor) : 0,
          cost: settings.rerollCost,
        });
        // Multi-roll cards (pf1 attacks) get a button in each roll's own row.
        const selector = adapter.controlAnchor?.(target);
        const anchor = selector ? html.querySelector(selector) : html;
        if (!(anchor instanceof HTMLElement)) continue;
        addFateControls(anchor, state, {
          cost: settings.rerollCost,
          labels: labels(),
          onClick: () =>
            bus.request("fateReroll", { messageId: message.id, target }).catch((err) => {
              notifyError(err);
              throw err;
            }),
        });
      }
    },
  );

  // Re-render recent rolls when a character's points change, so their
  // buttons enable or disable.
  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.points`)) return;
    for (const message of game.messages.contents.slice(-50)) {
      if (message.speaker?.actor === actor.id) ui.chat.updateMessage(message);
    }
  });
}
