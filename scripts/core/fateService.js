// @ts-check
// The GM-side handlers for every point change. Only the active GM's client
// runs these (see requestBus.js); they check permissions, apply the change
// one actor at a time, and return a record of what happened for the log.

import { getActorPoints, writeActorPoints } from "./actorPoints.js";
import { FateError } from "./errors.js";
import { createKeyedQueue } from "./keyedQueue.js";
import { awardPoints, setPoints, spendPoints } from "./points.js";

/** @typedef {import("./types.js").ActorLike} ActorLike */
/** @typedef {import("./types.js").UserLike} UserLike */
/** @typedef {import("./types.js").PointChange} PointChange */

/**
 * @typedef {PointChange & { action: "award" | "spend" | "set", actorId: string, userId: string }} ChangeRecord
 */

/** @typedef {{ userId: string }} RequestContext */

/**
 * @param {object} deps
 * @param {(id: string) => UserLike | undefined} deps.getUser
 * @param {(id: string) => ActorLike | undefined} deps.getActor
 * @param {() => number} deps.getMaxPoints
 */
export function createFateService({ getUser, getActor, getMaxPoints }) {
  const queue = createKeyedQueue();

  /** @param {string} userId */
  const requireUser = (userId) => {
    const user = getUser(userId);
    if (!user) throw new FateError("not-permitted", "Unknown user");
    return user;
  };

  /** @param {UserLike} user */
  const requireGM = (user) => {
    if (!user.isGM) throw new FateError("not-permitted", "Only the GM can do that");
  };

  /** @param {UserLike} user @param {ActorLike} actor */
  const requireOwner = (user, actor) => {
    if (!user.isGM && !actor.testUserPermission(user, "OWNER")) {
      throw new FateError("not-permitted", "You don't own that character");
    }
  };

  /** @param {unknown} id */
  const requireActor = (id) => {
    const actor = typeof id === "string" ? getActor(id) : undefined;
    if (!actor) throw new FateError("not-found", `No actor with id ${String(id)}`);
    return actor;
  };

  /**
   * Apply a change to one actor inside its queue, so concurrent requests
   * always see the latest value.
   * @param {ActorLike} actor
   * @param {ChangeRecord["action"]} action
   * @param {string} userId
   * @param {(current: number) => PointChange} compute
   * @returns {Promise<ChangeRecord>}
   */
  const applyChange = (actor, action, userId, compute) =>
    queue.run(actor.id, async () => {
      const result = compute(getActorPoints(actor));
      if (result.delta !== 0) await writeActorPoints(actor, result.after);
      return { action, actorId: actor.id, userId, ...result };
    });

  return {
    /**
     * @param {{ actorIds: string[], amount: number }} payload
     * @param {RequestContext} context
     */
    async award({ actorIds, amount }, { userId }) {
      requireGM(requireUser(userId));
      if (!Array.isArray(actorIds) || actorIds.length === 0) {
        throw new FateError("invalid", "Choose at least one character");
      }
      const actors = actorIds.map(requireActor);
      const max = getMaxPoints();
      awardPoints(0, amount, max); // validate before touching any actor
      return Promise.all(
        actors.map((actor) =>
          applyChange(actor, "award", userId, (current) => awardPoints(current, amount, max)),
        ),
      );
    },

    /**
     * @param {{ actorId: string, cost: number }} payload
     * @param {RequestContext} context
     */
    async spend({ actorId, cost }, { userId }) {
      const user = requireUser(userId);
      const actor = requireActor(actorId);
      requireOwner(user, actor);
      return applyChange(actor, "spend", userId, (current) => spendPoints(current, cost));
    },

    /**
     * @param {{ actorId: string, value: number }} payload
     * @param {RequestContext} context
     */
    async setPoints({ actorId, value }, { userId }) {
      requireGM(requireUser(userId));
      const actor = requireActor(actorId);
      const max = getMaxPoints();
      return applyChange(actor, "set", userId, (current) => setPoints(current, value, max));
    },
  };
}
