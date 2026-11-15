// @ts-check
// The GM-side handlers for every point change. Only the active GM's client
// runs these (see requestBus.js); they check permissions, apply the change
// one actor at a time, and log it in the same update.

import { getActorPoints } from "./actorPoints.js";
import { MODULE_ID } from "./constants.js";
import { FateError } from "./errors.js";
import { createKeyedQueue } from "./keyedQueue.js";
import { LOG_FLAG, createLogEntry, findRefundableSpend, getActorLog, markRefunded } from "./log.js";
import { awardPoints, refundPoints, setPoints, spendPoints } from "./points.js";

/** @typedef {import("./types.js").ActorLike} ActorLike */
/** @typedef {import("./types.js").UserLike} UserLike */
/** @typedef {import("./types.js").PointChange} PointChange */
/** @typedef {import("./log.js").LogEntry} LogEntry */

/**
 * @typedef {PointChange & { action: LogEntry["action"], actorId: string, userId: string, entryId: string }} ChangeRecord
 */

/** @typedef {{ userId: string }} RequestContext */

/**
 * @typedef {object} ChangeSpec
 * @property {LogEntry["action"]} action
 * @property {(current: number, log: LogEntry[]) => PointChange} compute
 * @property {string} [reason]
 * @property {LogEntry["source"]} [source]
 * @property {(log: LogEntry[], entry: LogEntry) => { log: LogEntry[], entry: LogEntry }} [link]
 *   Adjust the log and the new entry before saving (used to link refunds).
 */

/**
 * @param {object} deps
 * @param {(id: string) => UserLike | undefined} deps.getUser
 * @param {(id: string) => ActorLike | undefined} deps.getActor
 * @param {() => number} deps.getMaxPoints
 * @param {() => string} [deps.newId]
 * @param {() => number} [deps.now]
 */
export function createFateService({
  getUser,
  getActor,
  getMaxPoints,
  newId = () => crypto.randomUUID(),
  now = () => Date.now(),
}) {
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
   * always see the latest value, and save the points and log together.
   * @param {ActorLike} actor
   * @param {string} userId
   * @param {ChangeSpec} spec
   * @returns {Promise<ChangeRecord>}
   */
  const applyChange = (actor, userId, { action, compute, reason, source, link }) =>
    queue.run(actor.id, async () => {
      let log = getActorLog(actor);
      const change = compute(getActorPoints(actor), log);
      let entry = createLogEntry({
        id: newId(),
        time: now(),
        action,
        change,
        userId,
        reason,
        source,
      });
      if (link) ({ log, entry } = link(log, entry));
      await actor.update({
        [`flags.${MODULE_ID}.points`]: change.after,
        [`flags.${MODULE_ID}.${LOG_FLAG}`]: [...log, entry],
      });
      return { action, actorId: actor.id, userId, ...change, entryId: entry.id };
    });

  /**
   * Link a refund entry to the spend it undoes.
   * @param {string} spendId
   * @param {boolean} [automatic]
   */
  const linkRefund =
    (spendId, automatic = false) =>
    (/** @type {LogEntry[]} */ log, /** @type {LogEntry} */ entry) => ({
      log: markRefunded(log, spendId, entry.id),
      entry: /** @type {LogEntry} */ ({
        ...entry,
        refundOf: spendId,
        ...(automatic ? { automatic: true } : {}),
      }),
    });

  return {
    /**
     * @param {{ actorIds: string[], amount: number, reason?: string }} payload
     * @param {RequestContext} context
     */
    async award({ actorIds, amount, reason }, { userId }) {
      requireGM(requireUser(userId));
      if (!Array.isArray(actorIds) || actorIds.length === 0) {
        throw new FateError("invalid", "Choose at least one character");
      }
      const actors = actorIds.map(requireActor);
      const max = getMaxPoints();
      awardPoints(0, amount, max); // validate before touching any actor
      return Promise.all(
        actors.map((actor) =>
          applyChange(actor, userId, {
            action: "award",
            reason,
            compute: (current) => awardPoints(current, amount, max),
          }),
        ),
      );
    },

    /**
     * @param {{ actorId: string, cost: number, reason?: string, source?: LogEntry["source"] }} payload
     * @param {RequestContext} context
     */
    async spend({ actorId, cost, reason, source }, { userId }) {
      const user = requireUser(userId);
      const actor = requireActor(actorId);
      requireOwner(user, actor);
      return applyChange(actor, userId, {
        action: "spend",
        reason,
        source,
        compute: (current) => spendPoints(current, cost),
      });
    },

    /**
     * @param {{ actorId: string, value: number, reason?: string }} payload
     * @param {RequestContext} context
     */
    async setPoints({ actorId, value, reason }, { userId }) {
      requireGM(requireUser(userId));
      const actor = requireActor(actorId);
      const max = getMaxPoints();
      return applyChange(actor, userId, {
        action: "set",
        reason,
        compute: (current) => setPoints(current, value, max),
      });
    },

    /**
     * Give points back (GM only), capped at the maximum. With an entryId,
     * refunds that logged spend and links the two entries.
     * @param {{ actorId: string, amount?: number, entryId?: string, reason?: string }} payload
     * @param {RequestContext} context
     */
    async refund({ actorId, amount, entryId, reason }, { userId }) {
      requireGM(requireUser(userId));
      const actor = requireActor(actorId);
      const max = getMaxPoints();
      if (entryId === undefined) {
        return applyChange(actor, userId, {
          action: "refund",
          reason,
          compute: (current) => refundPoints(current, /** @type {number} */ (amount), max),
        });
      }
      return applyChange(actor, userId, {
        action: "refund",
        reason,
        compute: (current, log) =>
          refundPoints(current, -findRefundableSpend(log, entryId).delta, max),
        link: linkRefund(entryId),
      });
    },

    /**
     * Undo a spend after a later step failed. Internal to the GM client: not
     * exposed over the socket, so it skips permission checks. Uncapped, so
     * it restores exactly what was taken.
     * @param {ChangeRecord} spent
     */
    async rollback(spent) {
      const actor = requireActor(spent.actorId);
      const amount = -spent.delta;
      if (amount <= 0) return null;
      return applyChange(actor, spent.userId, {
        action: "refund",
        compute: (current) => refundPoints(current, amount),
        link: linkRefund(spent.entryId, true),
      });
    },
  };
}
