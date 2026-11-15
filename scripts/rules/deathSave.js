// @ts-check
// Death saves, mirroring dnd5e 5.3.3's Actor5e#rollDeathSave, so a Fate
// Reroll can replace the original roll's effect on the character.

/**
 * @typedef {object} DeathState
 * @property {number} success
 * @property {number} failure
 * @property {number} hp
 */

/**
 * @typedef {object} DeathRoll
 * @property {number} total
 * @property {boolean} isCritical
 * @property {boolean} isFumble
 */

/** @typedef {"success" | "stable" | "revived" | "failure" | "dead"} DeathOutcome */

/** dnd5e's own chat messages for the outcomes it announces. */
export const DEATH_SAVE_CHAT_KEYS = /** @type {const} */ ({
  revived: "DND5E.DeathSaveCriticalSuccess",
  stable: "DND5E.DeathSaveSuccess",
  dead: "DND5E.DeathSaveFailure",
});

/**
 * What a death save does to the counts.
 * @param {Pick<DeathState, "success" | "failure">} before
 * @param {DeathRoll} roll
 * @param {number} [target]
 * @returns {{ success: number, failure: number, revived: boolean, outcome: DeathOutcome }}
 */
export function resolveDeathSave(before, roll, target = 10) {
  if (roll.total >= target) {
    if (roll.isCritical) return { success: 0, failure: 0, revived: true, outcome: "revived" };
    const success = before.success + 1;
    if (success === 3) return { success: 0, failure: 0, revived: false, outcome: "stable" };
    return {
      success: Math.min(success, 3),
      failure: before.failure,
      revived: false,
      outcome: "success",
    };
  }
  const failure = Math.min(before.failure + (roll.isFumble ? 2 : 1), 3);
  return {
    success: before.success,
    failure,
    revived: false,
    outcome: failure >= 3 ? "dead" : "failure",
  };
}

/**
 * The character's state after a death save, given the state before it.
 * @param {DeathState} before
 * @param {DeathRoll} roll
 * @param {number} [target]
 * @returns {DeathState}
 */
export function deathStateAfter(before, roll, target = 10) {
  const { success, failure, revived } = resolveDeathSave(before, roll, target);
  return { success, failure, hp: revived ? 1 : before.hp };
}

/**
 * Read the death-save state from dnd5e actor attributes.
 * @param {any} attributes actor.system.attributes
 * @returns {DeathState}
 */
export const snapshotDeathState = (attributes) => ({
  success: attributes?.death?.success ?? 0,
  failure: attributes?.death?.failure ?? 0,
  hp: attributes?.hp?.value ?? 0,
});

/** @param {DeathState} a @param {DeathState} b */
const sameState = (a, b) => a.success === b.success && a.failure === b.failure && a.hp === b.hp;

/**
 * Check the character still shows the original roll's effect.
 * @param {{ before: DeathState, current: DeathState, original: DeathRoll, target?: number }} input
 */
export const isDeathSaveCurrent = ({ before, current, original, target }) =>
  sameState(current, deathStateAfter(before, original, target));

/**
 * Work out the actor updates that swap the original death save's effect for
 * the fated one's. Refuses if the character has changed since the original.
 * @param {{ before: DeathState, current: DeathState, original: DeathRoll, fated: DeathRoll, target?: number }} input
 * @returns {{ ok: false, reason: "stale" } | { ok: true, updates: Record<string, number>, chatKey: string | null }}
 */
export function planFatedDeathSave({ before, current, original, fated, target = 10 }) {
  if (!isDeathSaveCurrent({ before, current, original, target })) {
    return { ok: false, reason: "stale" };
  }
  const was = resolveDeathSave(before, original, target);
  const now = resolveDeathSave(before, fated, target);
  if (was.outcome === now.outcome && was.success === now.success && was.failure === now.failure) {
    return { ok: true, updates: {}, chatKey: null };
  }

  /** @type {Record<string, number>} */
  const updates = {
    "system.attributes.death.success": now.success,
    "system.attributes.death.failure": now.failure,
  };
  if (now.revived) updates["system.attributes.hp.value"] = 1;
  const chatKey =
    now.outcome === "revived" || now.outcome === "stable" || now.outcome === "dead"
      ? DEATH_SAVE_CHAT_KEYS[now.outcome]
      : null;
  return { ok: true, updates, chatKey };
}
