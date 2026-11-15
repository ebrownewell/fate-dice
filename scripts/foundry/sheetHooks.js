// @ts-check
// A "Fate Dice" button in the header of character sheets, opening the log.

import { MODULE_ID } from "../core/constants.js";
import { FateLogApp } from "../apps/FateLogApp.js";

/** @param {{ api: any }} deps */
export function registerSheetHooks({ api }) {
  Hooks.on(
    "getHeaderControlsActorSheetV2",
    (/** @type {any} */ app, /** @type {any[]} */ controls) => {
      const actor = app.document;
      if (actor?.type !== "character" || !actor.isOwner) return;
      controls.push({
        icon: "fa-solid fa-dice-d20",
        label: "FATEDICE.Log.Open",
        action: "fateDiceLog",
        onClick: () => FateLogApp.show(actor, api),
      });
    },
  );

  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) FateLogApp.refresh(actor.id);
  });
}
