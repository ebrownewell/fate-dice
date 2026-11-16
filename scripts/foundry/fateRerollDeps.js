// @ts-check
// Foundry implementations of the Fate Reroll handler's dependencies.

import { MODULE_ID } from "../core/constants.js";
import { buildFatedMessageData } from "../core/fatedMessage.js";
import { readSettings } from "../core/settings.js";
import { getSystemAdapter } from "../systems/index.js";
import { snapshotDeathState } from "../rules/deathSave.js";

/** Localization keys for a fated pf1 attack card. */
export const PF1_ATTACK_LABEL_KEYS = {
  title: "FATEDICE.Pf1.Title",
  original: "FATEDICE.Pf1.Original",
  newThreat: "FATEDICE.Pf1.NewThreat",
  keptThreat: "FATEDICE.Pf1.KeptThreat",
  lostThreat: "FATEDICE.Pf1.LostThreat",
  natural20: "FATEDICE.Pf1.Natural20",
  natural1: "FATEDICE.Pf1.Natural1",
};

/**
 * @param {{ service: any }} options
 */
export function createFoundryFateRerollDeps({ service }) {
  return {
    getMessage: (/** @type {string} */ id) => game.messages.get(id)?.toObject(),
    getAdapter: () => getSystemAdapter(game.system.id),
    getSettings: () => readSettings(game.settings, MODULE_ID),
    service,

    async rollD20() {
      const roll = await new Roll("1d20").evaluate();
      return roll.dice[0].results[0].result;
    },

    /** @param {{ original: any, rollData: any, outcome: any, userId: string, info: any, target: string, extraDice: number[] }} args */
    async createFatedMessage({ original, rollData, outcome, userId, info, target, extraDice }) {
      const adapter = /** @type {any} */ (getSystemAdapter(game.system.id));
      // Some rolls (pf1 attacks) get a card of the adapter's own.
      if (adapter?.buildFatedMessageData) {
        const data = adapter.buildFatedMessageData({
          original,
          target,
          rollData,
          outcome,
          info,
          userId,
          extraDice,
          labels: Object.fromEntries(
            Object.entries(PF1_ATTACK_LABEL_KEYS).map(([k, key]) => [k, game.i18n.localize(key)]),
          ),
        });
        if (data) return ChatMessage.create({ ...data, sound: CONFIG.sounds.dice });
      }
      let data = buildFatedMessageData({
        original,
        rollData,
        outcome,
        userId,
        flavorSuffix: game.i18n.localize("FATEDICE.Chat.FateReroll"),
      });
      // Some systems (pf2e) also show the outcome in the card's text.
      if (adapter?.adjustFatedMessage) {
        data = adapter.adjustFatedMessage(data, {
          info,
          outcome,
          rollData,
          localize: (/** @type {string} */ key) => game.i18n.localize(key),
        });
      }
      return ChatMessage.create(data);
    },

    /** @param {string} messageId @param {string} target @param {string} fatedMessageId */
    markFated: (messageId, target, fatedMessageId) =>
      game.messages.get(messageId).setFlag(MODULE_ID, `fatedTargets.${target}`, fatedMessageId),

    /** @param {{ actorId: string, from: number, to: number }} args */
    async updateInitiative({ actorId, from, to }) {
      for (const combat of game.combats) {
        for (const combatant of combat.combatants) {
          if (combatant.actorId === actorId && combatant.initiative === from) {
            await combatant.update({ initiative: to });
          }
        }
      }
    },

    /** @param {string} actorId */
    getDeathState: (actorId) => snapshotDeathState(game.actors.get(actorId)?.system?.attributes),

    /** @param {{ actorId: string, updates: Record<string, number>, chatKey: string | null }} args */
    async applyDeathSave({ actorId, updates, chatKey }) {
      const actor = game.actors.get(actorId);
      await actor.update(updates);
      if (chatKey) {
        await ChatMessage.create({
          content: game.i18n.format(chatKey, { name: actor.name }),
          speaker: ChatMessage.getSpeaker({ actor }),
        });
      }
    },
  };
}
