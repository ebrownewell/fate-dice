// @ts-check
// Entry point: wires Foundry hooks to the logic in scripts/rules and
// scripts/core.

import { createApi } from "./core/api.js";
import { MODULE_ID, SOCKET_CHANNEL } from "./core/constants.js";
import { createFateService } from "./core/fateService.js";
import { createRequestBus } from "./core/requestBus.js";
import { registerSettings } from "./core/settings.js";
import { registerQuenchTests } from "./quench.js";

Hooks.once("init", () => {
  registerSettings(game.settings, MODULE_ID);
});

Hooks.once("ready", () => {
  const service = createFateService({
    getUser: (id) => game.users.get(id),
    getActor: (id) => game.actors.get(id),
    getMaxPoints: () => game.settings.get(MODULE_ID, "maxPoints"),
  });

  const bus = createRequestBus({
    socket: game.socket,
    channel: SOCKET_CHANNEL,
    getUserId: () => game.user.id,
    getActiveGMId: () => game.users.activeGM?.id ?? null,
    handlers: {
      award: service.award,
      spend: service.spend,
      setPoints: service.setPoints,
    },
  });

  game.modules.get(MODULE_ID).api = createApi({ bus });
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
});

Hooks.on("quenchReady", registerQuenchTests);
