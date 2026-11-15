// @ts-check
// GM-side nomination handlers. All changes run one at a time, so limits
// and the deciding vote can't race; the nominee is awarded exactly once.

import { FateError } from "./errors.js";
import { createKeyedQueue } from "./keyedQueue.js";
import { castVote, checkNomination, createNomination, decide, finalize } from "./nominations.js";

/** @typedef {import("./nominations.js").Nomination} Nomination */

const MAX_REASON = 500;

/**
 * @param {object} deps
 * @param {(id: string) => { id: string, isGM: boolean } | undefined} deps.getUser
 * @param {(id: string) => { id: string, ownerIds: string[] } | undefined} deps.getActor
 * @param {(actor: any) => number} deps.getPoints
 * @param {() => any} deps.getSettings
 * @param {() => number} deps.getSession
 * @param {() => string[]} deps.activePlayerIds
 * @param {() => Nomination[]} deps.listNominations
 * @param {(id: string) => Nomination | undefined} deps.findNomination
 * @param {(nom: Nomination) => Promise<unknown>} deps.createNomination Posts the nomination card.
 * @param {(nom: Nomination) => Promise<unknown>} deps.saveNomination Updates the card.
 * @param {(nom: Nomination) => Promise<unknown>} deps.awardNominee
 * @param {() => string} deps.newId
 * @param {() => number} deps.now
 */
export function createNominationService(deps) {
  const queue = createKeyedQueue();
  const KEY = "nominations";

  /** @param {string} userId */
  const requireUser = (userId) => {
    const user = deps.getUser(userId);
    if (!user) throw new FateError("not-permitted", "Unknown user");
    return user;
  };

  /** @param {string} userId */
  const requireGM = (userId) => {
    if (!requireUser(userId).isGM) throw new FateError("not-permitted", "Only the GM can do that");
  };

  /** @param {unknown} id */
  const requireNomination = (id) => {
    const nom = typeof id === "string" ? deps.findNomination(id) : undefined;
    if (!nom) throw new FateError("not-found", "That nomination doesn't exist");
    return nom;
  };

  /**
   * Save a changed nomination; award first if it was just approved. (Only
   * open nominations reach here: castVote, decide and finalize refuse closed
   * ones.) If the award fails, the votes are kept but it stays open.
   * @param {Nomination} after
   */
  async function commit(after) {
    if (after.status === "approved") {
      try {
        await deps.awardNominee(after);
      } catch (err) {
        await deps.saveNomination({ ...after, status: "pending" });
        throw err;
      }
    }
    await deps.saveNomination(after);
    return after;
  }

  return {
    /**
     * @param {{ actorId: string, reason: string }} payload
     * @param {{ userId: string }} context
     */
    nominate({ actorId, reason }, { userId }) {
      return queue.run(KEY, async () => {
        const nominator = requireUser(userId);
        const text = typeof reason === "string" ? reason.trim() : "";
        if (!text) throw new FateError("note-required", "Say why they deserve it");
        if (text.length > MAX_REASON) throw new FateError("invalid", "That reason is too long");
        const actor = typeof actorId === "string" ? deps.getActor(actorId) : undefined;
        if (!actor) throw new FateError("not-found", "That character doesn't exist");

        const settings = deps.getSettings();
        const session = deps.getSession();
        const check = checkNomination({
          mode: settings.nominationMode,
          nominator,
          actor,
          points: deps.getPoints(actor),
          max: settings.maxPoints,
          session,
          limit: settings.nominationLimit,
          existing: deps.listNominations(),
        });
        if (!check.ok) throw new FateError(check.code, `Can't nominate (${check.code})`);

        const nom = createNomination({
          id: deps.newId(),
          nominatorId: userId,
          actor,
          reason: text,
          session,
          mode: settings.nominationMode,
          activePlayerIds: deps.activePlayerIds(),
          now: deps.now(),
        });
        await deps.createNomination(nom);
        // A vote with only the nominator eligible passes straight away.
        if (nom.mode === "vote" && nom.eligible.length === 1) {
          return commit({ ...nom, status: "approved" });
        }
        return nom;
      });
    },

    /**
     * @param {{ nominationId: string, approve: boolean }} payload
     * @param {{ userId: string }} context
     */
    vote({ nominationId, approve }, { userId }) {
      return queue.run(KEY, async () => {
        requireUser(userId);
        const nom = requireNomination(nominationId);
        return commit(castVote(nom, userId, Boolean(approve)));
      });
    },

    /**
     * GM approval mode: approve or deny.
     * @param {{ nominationId: string, approve: boolean }} payload
     * @param {{ userId: string }} context
     */
    decide({ nominationId, approve }, { userId }) {
      return queue.run(KEY, async () => {
        requireGM(userId);
        const nom = requireNomination(nominationId);
        return commit(decide(nom, Boolean(approve)));
      });
    },

    /**
     * Vote mode: the GM accepts the votes cast so far.
     * @param {{ nominationId: string }} payload
     * @param {{ userId: string }} context
     */
    finalize({ nominationId }, { userId }) {
      return queue.run(KEY, async () => {
        requireGM(userId);
        const nom = requireNomination(nominationId);
        return commit(finalize(nom));
      });
    },
  };
}
