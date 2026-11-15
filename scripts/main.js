// @ts-check
// Entry point: wires Foundry hooks to the logic in scripts/rules and
// scripts/core.

import { createApi } from "./core/api.js";
import { MODULE_ID, SOCKET_CHANNEL } from "./core/constants.js";
import { createFateRerollHandler } from "./core/fateRerollHandler.js";
import { createFateService } from "./core/fateService.js";
import { createRequestBus } from "./core/requestBus.js";
import { registerSettings } from "./core/settings.js";
import { registerChatHooks } from "./foundry/chatHooks.js";
import { registerDeathSaveHooks } from "./foundry/deathSaveHooks.js";
import { registerSheetHooks } from "./foundry/sheetHooks.js";
import { FateLogApp } from "./apps/FateLogApp.js";
import { GmPanelApp } from "./apps/GmPanelApp.js";
import { registerHud } from "./foundry/hudHooks.js";
import { createFoundryFateRerollDeps } from "./foundry/fateRerollDeps.js";
import { registerQuenchTests } from "./quench.js";

Hooks.once("init", () => {
  registerSettings(game.settings, MODULE_ID);
  if (game.system.id === "dnd5e") registerDeathSaveHooks();
});

Hooks.once("ready", () => {
  const service = createFateService({
    getUser: (id) => game.users.get(id),
    getActor: (id) => game.actors.get(id),
    getMaxPoints: () => game.settings.get(MODULE_ID, "maxPoints"),
  });
  const reroll = createFateRerollHandler(createFoundryFateRerollDeps({ service }));

  const bus = createRequestBus({
    socket: game.socket,
    channel: SOCKET_CHANNEL,
    getUserId: () => game.user.id,
    getActiveGMId: () => game.users.activeGM?.id ?? null,
    handlers: {
      award: service.award,
      spend: service.spend,
      setPoints: service.setPoints,
      refund: service.refund,
      fateReroll: reroll.fateReroll,
    },
  });

  const api = {
    ...createApi({ bus }),
    /** Open a character's Fate Dice log. @param {any} actor An Actor or its id. */
    openLog: (/** @type {any} */ actor) =>
      FateLogApp.show(typeof actor === "string" ? game.actors.get(actor) : actor, api),
    /** Open the GM's Fate Dice panel. */
    openPanel: () => GmPanelApp.show(api),
  };
  registerChatHooks({ bus });
  registerSheetHooks({ api });
  registerHud({ api });
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  // Messages already in the chat log rendered before the hooks existed.
  ui.chat?.render?.();
});

Hooks.on("quenchReady", registerQuenchTests);
