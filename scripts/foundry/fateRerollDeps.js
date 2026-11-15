// @ts-check
// Foundry implementations of the Fate Reroll handler's dependencies.

import { MODULE_ID } from "../core/constants.js";
import { buildFatedMessageData } from "../core/fatedMessage.js";
import { readSettings } from "../core/settings.js";
import { getSystemAdapter } from "../systems/index.js";
import { snapshotDeathState } from "../rules/deathSave.js";

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

    /** @param {{ original: any, rollData: any, outcome: any, userId: string }} args */
    async createFatedMessage({ original, rollData, outcome, userId }) {
      const data = buildFatedMessageData({
        original,
        rollData,
        outcome,
        userId,
        flavorSuffix: game.i18n.localize("FATEDICE.Chat.FateReroll"),
      });
      return ChatMessage.create(data);
    },

    /** @param {string} messageId @param {string} fatedMessageId */
    markFated: (messageId, fatedMessageId) =>
      game.messages.get(messageId).setFlag(MODULE_ID, "fatedBy", fatedMessageId),

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
