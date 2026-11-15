// @ts-check
// Nomination rules: who may nominate whom, voting, and outcomes. Pure.

import { FateError } from "./errors.js";

/**
 * @typedef {object} Nomination
 * @property {string} id
 * @property {string} nominatorId
 * @property {string} actorId
 * @property {string} reason
 * @property {number} session
 * @property {"gm" | "vote"} mode
 * @property {"pending" | "approved" | "rejected"} status
 * @property {string[]} eligible Users who may vote (vote mode).
 * @property {Record<string, boolean>} votes userId → yes/no
 * @property {number} createdAt
 */

/**
 * @param {object} input
 * @param {"off" | "gm" | "vote"} input.mode
 * @param {{ id: string, isGM: boolean }} input.nominator
 * @param {{ id: string, ownerIds: string[] }} input.actor
 * @param {number} input.points The nominee's current Fate Dice.
 * @param {number} input.max
 * @param {number} input.session
 * @param {number} input.limit Nominations per player per session; 0 = unlimited.
 * @param {Nomination[]} input.existing
 * @returns {{ ok: true } | { ok: false, code: "disabled" | "not-permitted" | "at-max" | "limit-reached" }}
 */
export function checkNomination({ mode, nominator, actor, points, max, session, limit, existing }) {
  if (mode === "off") return { ok: false, code: "disabled" };
  if (nominator.isGM || actor.ownerIds.includes(nominator.id)) {
    return { ok: false, code: "not-permitted" };
  }
  if (points >= max) return { ok: false, code: "at-max" };
  const used = existing.filter(
    (n) => n.nominatorId === nominator.id && n.session === session,
  ).length;
  if (limit > 0 && used >= limit) return { ok: false, code: "limit-reached" };
  return { ok: true };
}

/**
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.nominatorId
 * @param {{ id: string, ownerIds: string[] }} input.actor
 * @param {string} input.reason
 * @param {number} input.session
 * @param {"gm" | "vote"} input.mode
 * @param {string[]} input.activePlayerIds Players online now (not GMs).
 * @param {number} input.now
 * @returns {Nomination}
 */
export function createNomination({
  id,
  nominatorId,
  actor,
  reason,
  session,
  mode,
  activePlayerIds,
  now,
}) {
  const eligible =
    mode === "vote"
      ? [...new Set([nominatorId, ...activePlayerIds])].filter((u) => !actor.ownerIds.includes(u))
      : [];
  return {
    id,
    nominatorId,
    actorId: actor.id,
    reason: reason.trim(),
    session,
    mode,
    status: "pending",
    eligible,
    votes: mode === "vote" ? { [nominatorId]: true } : {},
    createdAt: now,
  };
}

/**
 * @param {Nomination} nom
 * @returns {{ yes: number, no: number, eligible: number, outcome: "pending" | "approved" | "rejected" }}
 */
export function tally(nom) {
  const cast = nom.eligible.filter((u) => u in nom.votes);
  const yes = cast.filter((u) => nom.votes[u]).length;
  const no = cast.length - yes;
  const eligible = nom.eligible.length;
  if (cast.length < eligible) return { yes, no, eligible, outcome: "pending" };
  return { yes, no, eligible, outcome: yes > eligible / 2 ? "approved" : "rejected" };
}

/** @param {Nomination} nom */
const requireOpen = (nom) => {
  if (nom.status !== "pending") throw new FateError("invalid", "That nomination is already closed");
};

/**
 * Record (or change) a vote. Closes the nomination when the last vote is in.
 * @param {Nomination} nom
 * @param {string} userId
 * @param {boolean} approve
 * @returns {Nomination}
 */
export function castVote(nom, userId, approve) {
  requireOpen(nom);
  if (nom.mode !== "vote") throw new FateError("invalid", "That nomination isn't put to a vote");
  if (!nom.eligible.includes(userId))
    throw new FateError("not-permitted", "You can't vote on that");
  const next = { ...nom, votes: { ...nom.votes, [userId]: approve } };
  const { outcome } = tally(next);
  return outcome === "pending" ? next : { ...next, status: outcome };
}

/**
 * The GM accepts the votes cast so far: passes if more said yes than no.
 * @param {Nomination} nom
 * @returns {Nomination}
 */
export function finalize(nom) {
  requireOpen(nom);
  const yes = Object.values(nom.votes).filter(Boolean).length;
  const no = Object.values(nom.votes).length - yes;
  return { ...nom, status: yes > no ? "approved" : "rejected" };
}

/**
 * The GM approves or denies.
 * @param {Nomination} nom
 * @param {boolean} approve
 * @returns {Nomination}
 */
export function decide(nom, approve) {
  requireOpen(nom);
  return { ...nom, status: approve ? "approved" : "rejected" };
}
