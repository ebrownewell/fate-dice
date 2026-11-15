// @ts-check
// GM-side Fate Reroll: validate, spend, roll the fate die, post the fated
// roll and mark the original. Foundry-specific steps are injected, so the
// whole flow is unit-tested.

import { FateError } from "./errors.js";
import { checkFateable, getFateFlags } from "./fateRerollPolicy.js";
import { createKeyedQueue } from "./keyedQueue.js";
import { getFateRules } from "./settings.js";
import { resolveFateReroll } from "../rules/fateReroll.js";
import { isDeathSaveCurrent, planFatedDeathSave } from "../rules/deathSave.js";

/** @typedef {import("../systems/dnd5e.js").RollInfo} RollInfo */
/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */
/** @typedef {import("./fateService.js").ChangeRecord} ChangeRecord */

/**
 * @typedef {object} SystemAdapter
 * @property {string} id
 * @property {(message: any) => RollInfo | null} getRollInfo
 * @property {(roll: any, info: RollInfo, outcome: FateRerollResult) => any} buildFatedRoll
 */

/**
 * @param {object} deps
 * @param {(id: string) => any} deps.getMessage Chat message data, or undefined.
 * @param {() => SystemAdapter | null} deps.getAdapter
 * @param {() => any} deps.getSettings Current setting values (see settings.js).
 * @param {{ spend: Function, rollback: (change: ChangeRecord) => Promise<unknown> }} deps.service
 * @param {() => Promise<number>} deps.rollD20 Rolls the fate die; returns its natural result.
 * @param {(args: { original: any, rollData: any, outcome: FateRerollResult, userId: string }) => Promise<{ id: string }>} deps.createFatedMessage
 * @param {(messageId: string, fatedMessageId: string) => Promise<unknown>} deps.markFated
 * @param {(args: { actorId: string, from: number, to: number }) => Promise<unknown>} deps.updateInitiative
 * @param {(actorId: string) => import("../rules/deathSave.js").DeathState} deps.getDeathState
 * @param {(args: { actorId: string, updates: Record<string, number>, chatKey: string | null }) => Promise<unknown>} deps.applyDeathSave
 */
export function createFateRerollHandler(deps) {
  const queue = createKeyedQueue();

  return {
    /**
     * @param {{ messageId: string }} payload
     * @param {{ userId: string }} context
     */
    fateReroll({ messageId }, { userId }) {
      return queue.run(`message:${messageId}`, async () => {
        const message = typeof messageId === "string" ? deps.getMessage(messageId) : undefined;
        if (!message) throw new FateError("not-found", "That chat message no longer exists");

        const settings = deps.getSettings();
        const adapter = deps.getAdapter();
        const info = adapter?.getRollInfo(message) ?? null;
        const check = checkFateable({ info, flags: getFateFlags(message), settings });
        if (!adapter || !info || !check.ok) {
          throw new FateError(
            "not-fateable",
            `Can't fate this roll (${check.ok ? "no adapter" : check.reason})`,
          );
        }

        // A death save can only be fated while the character still shows its effect.
        const deathSave = info.kind === "death" ? getFateFlags(message).deathSave : undefined;
        const target = info.target ?? 10;
        const original = {
          total: info.total,
          isCritical: info.keptNatural >= info.critThreshold,
          isFumble: info.keptNatural === 1,
        };
        if (
          deathSave &&
          !isDeathSaveCurrent({
            before: deathSave.before,
            current: deps.getDeathState(info.actorId),
            original,
            target,
          })
        ) {
          throw new FateError("not-fateable", "The character has changed since this death save");
        }

        /** @type {ChangeRecord} */
        const change = await deps.service.spend(
          { actorId: info.actorId, cost: settings.rerollCost },
          { userId },
        );

        try {
          const fateDie = await deps.rollD20();
          const outcome = resolveFateReroll({
            dice: info.dice,
            mode: info.mode,
            fateDie,
            rules: getFateRules(settings),
            critThreshold: info.critThreshold,
          });
          const rollData = adapter.buildFatedRoll(message.rolls[0], info, outcome);
          const created = await deps.createFatedMessage({
            original: message,
            rollData,
            outcome,
            userId,
          });
          await deps.markFated(messageId, created.id);

          if (deathSave && outcome.kept === "fate") {
            const plan = planFatedDeathSave({
              before: deathSave.before,
              current: deps.getDeathState(info.actorId),
              original,
              fated: {
                total: rollData.total,
                isCritical: outcome.isCritical,
                isFumble: outcome.isFumble,
              },
              target,
            });
            if (!plan.ok)
              throw new FateError("not-fateable", "The character changed during the reroll");
            if (Object.keys(plan.updates).length > 0) {
              await deps.applyDeathSave({
                actorId: info.actorId,
                updates: plan.updates,
                chatKey: plan.chatKey,
              });
            }
          }

          if (info.kind === "initiative" && rollData.total !== info.total) {
            await deps.updateInitiative({
              actorId: info.actorId,
              from: info.total,
              to: rollData.total,
            });
          }

          return { change, outcome, messageId: created.id, total: rollData.total };
        } catch (err) {
          await deps.service.rollback(change);
          throw err;
        }
      });
    },
  };
}
