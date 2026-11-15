// @ts-check
// Shapes of the Foundry documents the core logic relies on. Real Foundry
// Users and Actors satisfy these; tests use small in-memory fakes.

/**
 * @typedef {object} UserLike
 * @property {string} id
 * @property {boolean} isGM
 */

/**
 * @typedef {object} ActorLike
 * @property {string} id
 * @property {(scope: string, key: string) => unknown} getFlag
 * @property {(scope: string, key: string, value: unknown) => Promise<unknown>} setFlag
 * @property {(changes: Record<string, unknown>) => Promise<unknown>} update
 * @property {(user: UserLike, level: string) => boolean} testUserPermission
 */

/**
 * @typedef {object} PointChange
 * @property {number} before
 * @property {number} after
 * @property {number} delta
 */

export {};
