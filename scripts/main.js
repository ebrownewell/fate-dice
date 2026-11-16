// @ts-check
// Entry point: wires Foundry hooks to the logic in scripts/rules and
// scripts/core.

import { createApi } from "./core/api.js";
import { MODULE_ID, SOCKET_CHANNEL } from "./core/constants.js";
import { createFateRerollHandler } from "./core/fateRerollHandler.js";
import { createFateService } from "./core/fateService.js";
import { createRequestBus } from "./core/requestBus.js";
import { registerSettings } from "./core/settings.js";
import { TEMPLATES } from "./core/templates.js";
import { removeHeroPointReroll } from "./systems/pf2eMenu.js";
import { registerChatHooks } from "./foundry/chatHooks.js";
import { registerDeathSaveHooks } from "./foundry/deathSaveHooks.js";
import { registerSheetHooks } from "./foundry/sheetHooks.js";
import { FateLogApp } from "./apps/FateLogApp.js";
import { GmPanelApp } from "./apps/GmPanelApp.js";
import { registerHud } from "./foundry/hudHooks.js";
import { createFoundryFateRerollDeps } from "./foundry/fateRerollDeps.js";
import { registerQuenchTests } from "./quench.js";
import { ShopApp, getShopItems } from "./apps/ShopApp.js";
import { ShopEditorApp } from "./apps/ShopEditorApp.js";
import { createPurchaseHandler, registerShopHooks, registerShopMenu } from "./foundry/shopHooks.js";
import {
  createFoundryNominationService,
  openNominateDialog,
  registerNominationHooks,
} from "./foundry/nominationHooks.js";

Hooks.once("init", () => {
  registerSettings(game.settings, MODULE_ID, game.system.id);
  foundry.applications.handlebars.loadTemplates(TEMPLATES);
  registerShopMenu();
  if (game.system.id === "dnd5e") registerDeathSaveHooks();
  if (game.system.id === "pf2e") {
    Hooks.on(
      "getChatMessageContextOptions",
      (/** @type {any} */ _app, /** @type {any[]} */ options) => {
        if (game.settings.get(MODULE_ID, "hidePf2eHeroPointReroll")) removeHeroPointReroll(options);
      },
    );
  }
});

Hooks.once("ready", () => {
  const service = createFateService({
    getUser: (id) => game.users.get(id),
    getActor: (id) => game.actors.get(id),
    getMaxPoints: () => game.settings.get(MODULE_ID, "maxPoints"),
    getSession: () => game.settings.get(MODULE_ID, "session"),
    getShopItems,
  });
  const reroll = createFateRerollHandler(createFoundryFateRerollDeps({ service }));
  const nominations = createFoundryNominationService({ fateService: service });

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
      purchase: createPurchaseHandler(service),
      nominate: nominations.nominate,
      vote: nominations.vote,
      decide: nominations.decide,
      finalize: nominations.finalize,
    },
  });

  const api = {
    ...createApi({ bus }),
    /** Open a character's Fate Dice log. @param {any} actor An Actor or its id. */
    openLog: (/** @type {any} */ actor) =>
      FateLogApp.show(typeof actor === "string" ? game.actors.get(actor) : actor, api),
    /** Open a character's Fate Dice shop. @param {any} actor An Actor or its id. */
    openShop: (/** @type {any} */ actor) =>
      ShopApp.show(typeof actor === "string" ? game.actors.get(actor) : actor, api),
    /** Open the GM's Fate Dice panel. */
    openPanel: () => GmPanelApp.show(api),
    /** Ask the player whom to nominate for a Fate Die. */
    openNominate: () => openNominateDialog({ api }),
    /** GM: open the shop editor. */
    openShopEditor: () => new ShopEditorApp().render({ force: true }),
  };
  registerChatHooks({ bus });
  registerSheetHooks({ api });
  registerHud({ api });
  registerShopHooks();
  registerNominationHooks({ bus });
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
  // Messages already in the chat log rendered before the hooks existed.
  ui.chat?.render?.();
});

Hooks.on("quenchReady", registerQuenchTests);
