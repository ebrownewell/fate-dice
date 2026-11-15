// @ts-check
// Snapshot a character's death-save state into the message of each death
// save, so a later Fate Reroll can replace that roll's effect exactly.

import { MODULE_ID } from "../core/constants.js";
import { snapshotDeathState } from "../rules/deathSave.js";

export function registerDeathSaveHooks() {
  Hooks.on(
    "dnd5e.preRollDeathSaveV2",
    (/** @type {any} */ config, /** @type {any} */ _dialog, /** @type {any} */ message) => {
      const actor = config?.subject;
      if (!actor?.system?.attributes || !message) return;
      message.data ??= {};
      foundry.utils.setProperty(message.data, `flags.${MODULE_ID}.deathSave`, {
        before: snapshotDeathState(actor.system.attributes),
      });
    },
  );
}
