// @ts-check

/**
 * The party: every player-owned character, sorted by name.
 * @template {{ name: string, type: string, hasPlayerOwner: boolean }} A
 * @param {Iterable<A>} actors
 * @returns {A[]}
 */
export const selectParty = (actors) =>
  [...actors]
    .filter((a) => a.type === "character" && a.hasPlayerOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
