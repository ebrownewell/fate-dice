// @ts-check
// Public API, exposed as game.modules.get("fate-dice").api for macros and
// other modules. Changes go through the GM; reads are local.

import { getActorPoints } from "./actorPoints.js";

/** @typedef {import("./types.js").ActorLike} ActorLike */
/** @typedef {ActorLike | string} ActorRef */

/** @param {ActorRef} ref */
const toId = (ref) => (typeof ref === "string" ? ref : ref.id);

/**
 * @param {object} deps
 * @param {{ request: (action: string, payload: unknown) => Promise<any> }} deps.bus
 */
export function createApi({ bus }) {
  return {
    /** @param {Pick<ActorLike, "getFlag">} actor */
    getPoints: (actor) => getActorPoints(actor),

    /** @param {ActorRef | ActorRef[]} actors @param {number} [amount] @param {string} [reason] */
    award: (actors, amount = 1, reason) =>
      bus.request("award", {
        actorIds: [actors].flat().map(toId),
        amount,
        ...(reason ? { reason } : {}),
      }),

    /** @param {ActorRef} actor @param {number} [cost] */
    spend: (actor, cost = 1) => bus.request("spend", { actorId: toId(actor), cost }),

    /** @param {ActorRef} actor @param {number} value */
    setPoints: (actor, value) => bus.request("setPoints", { actorId: toId(actor), value }),

    /** @param {ActorRef} actor @param {number} [amount] GM only. */
    refund: (actor, amount = 1) => bus.request("refund", { actorId: toId(actor), amount }),

    /** @param {ActorRef} actor @param {string} entryId A spend in the actor's log. GM only. */
    refundEntry: (actor, entryId) => bus.request("refund", { actorId: toId(actor), entryId }),

    /** @param {ActorRef} actor @param {string} itemId @param {string} [note] */
    purchase: (actor, itemId, note = "") =>
      bus.request("purchase", { actorId: toId(actor), itemId, note }),

    /** @param {{ id: string } | string} message A chat message with a d20 roll. */
    fateReroll: (message) =>
      bus.request("fateReroll", { messageId: typeof message === "string" ? message : message.id }),
  };
}
