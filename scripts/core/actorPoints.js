// @ts-check
import { MODULE_ID } from "./constants.js";

/** @typedef {import("./types.js").ActorLike} ActorLike */

const FLAG = "points";

/**
 * Current Fate Dice on an actor. Missing or corrupt values read as 0.
 * @param {Pick<ActorLike, "getFlag">} actor
 */
export function getActorPoints(actor) {
  const value = actor.getFlag(MODULE_ID, FLAG);
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
