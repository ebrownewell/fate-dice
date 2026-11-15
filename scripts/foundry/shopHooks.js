// @ts-check
// Shop wiring: the purchase handler (with its chat announcement), keeping
// shop windows current, and the settings-menu entry for the editor.

import { MODULE_ID } from "../core/constants.js";
import { ShopApp, getShopItems } from "../apps/ShopApp.js";
import { ShopEditorApp } from "../apps/ShopEditorApp.js";
import { buildPurchaseMessage } from "../ui/purchaseMessage.js";

export function registerShopMenu() {
  game.settings.registerMenu(MODULE_ID, "shopEditor", {
    name: "FATEDICE.Editor.MenuName",
    label: "FATEDICE.Editor.MenuLabel",
    hint: "FATEDICE.Editor.MenuHint",
    icon: "fa-solid fa-store",
    type: ShopEditorApp,
    restricted: true,
  });
}

/**
 * Wrap the service's purchase so the GM's client also announces it in chat.
 * @param {{ purchase: Function }} service
 */
export function createPurchaseHandler(service) {
  return async (/** @type {any} */ payload, /** @type {{ userId: string }} */ context) => {
    const change = await service.purchase(payload, context);
    try {
      const actor = game.actors.get(change.actorId);
      const item = getShopItems().find((i) => i.id === payload.itemId);
      await ChatMessage.create({
        author: context.userId,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: buildPurchaseMessage({
          actorName: actor.name,
          itemName: item?.name ?? "?",
          description: item?.description ?? "",
          note: typeof payload.note === "string" ? payload.note.trim() : "",
          cost: Math.max(0, -change.delta),
          gain: Math.max(0, change.delta),
          labels: {
            spent: game.i18n.localize("FATEDICE.Shop.ChatSpent"),
            flaw: game.i18n.localize("FATEDICE.Shop.ChatFlaw"),
          },
        }),
      });
    } catch (err) {
      console.error("fate-dice | Couldn't announce purchase", err);
    }
    return change;
  };
}

export function registerShopHooks() {
  Hooks.on("updateSetting", (/** @type {any} */ setting) => {
    if (!setting.key?.startsWith(`${MODULE_ID}.`)) return;
    ShopApp.refresh();
    ShopEditorApp.refresh();
  });
  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) ShopApp.refresh(actor.id);
  });
}
