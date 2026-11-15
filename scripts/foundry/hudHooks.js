// @ts-check
// Puts the Fate Dice HUD on screen and keeps it up to date.

import { getActorPoints } from "../core/actorPoints.js";
import { MODULE_ID } from "../core/constants.js";
import { GmPanelApp } from "../apps/GmPanelApp.js";
import { clampPosition, hudModel, renderHud } from "../ui/hud.js";

const DRAG_THRESHOLD = 4;

/** @param {{ api: any }} deps */
export function registerHud({ api }) {
  const root = document.createElement("div");
  root.id = "fate-dice-hud";
  document.body.append(root);

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const size = () => ({ width: root.offsetWidth, height: root.offsetHeight });

  function place() {
    const saved = clampPosition(game.settings.get(MODULE_ID, "hudPosition"), size(), viewport());
    root.classList.toggle("positioned", Boolean(saved));
    root.style.left = saved ? `${saved.left}px` : "";
    root.style.top = saved ? `${saved.top}px` : "";
  }

  function refresh() {
    const character = game.user.character;
    const model = hudModel({
      isGM: game.user.isGM,
      character,
      points: character ? getActorPoints(character) : 0,
      max: game.settings.get(MODULE_ID, "maxPoints"),
      show: game.settings.get(MODULE_ID, "showHud"),
    });
    renderHud(root, model, {
      labels: {
        title: game.i18n.localize("FATEDICE.Title"),
        gmButton: game.i18n.localize("FATEDICE.Hud.GmButton"),
        openLog: game.i18n.localize("FATEDICE.Hud.OpenShop"),
      },
      onOpen: () => (game.user.isGM ? GmPanelApp.show(api) : api.openShop(game.user.character)),
    });
    place();
  }

  // Dragging: move with the pointer, save the spot when released.
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    const rect = root.getBoundingClientRect();
    let moved = false;

    const onMove = (/** @type {PointerEvent} */ e) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      const pos = clampPosition({ left: rect.left + dx, top: rect.top + dy }, size(), viewport());
      if (!pos) return;
      root.classList.add("positioned");
      root.style.left = `${pos.left}px`;
      root.style.top = `${pos.top}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) return;
      root.dataset.dragged = "true";
      const r = root.getBoundingClientRect();
      game.settings.set(MODULE_ID, "hudPosition", {
        left: Math.round(r.left),
        top: Math.round(r.top),
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) return;
    GmPanelApp.refresh();
    if (actor.id === game.user.character?.id) refresh();
  });
  Hooks.on("createActor", () => GmPanelApp.refresh());
  Hooks.on("deleteActor", () => GmPanelApp.refresh());
  Hooks.on("updateUser", (/** @type {any} */ user) => {
    if (user.id === game.user.id) refresh();
    GmPanelApp.refresh();
  });
  Hooks.on("clientSettingChanged", (/** @type {string} */ key) => {
    if (key === `${MODULE_ID}.showHud`) refresh();
  });
  Hooks.on("updateSetting", (/** @type {any} */ setting) => {
    if (setting.key === `${MODULE_ID}.maxPoints`) {
      refresh();
      GmPanelApp.refresh();
    }
  });
  window.addEventListener("resize", place);

  refresh();
  return { refresh, root };
}
