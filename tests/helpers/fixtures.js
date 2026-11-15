import { readFileSync } from "node:fs";

/**
 * Load a recorded chat message (ChatMessage#toObject()) as plain data.
 * Each call returns a fresh copy, so tests can modify it freely.
 * @param {string} system
 * @param {string} name
 * @returns {any}
 */
export function loadMessage(system, name) {
  const url = new URL(`../fixtures/${system}/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

/**
 * The first roll of a message, parsed from its stored JSON string.
 * @param {any} message
 */
export const firstRoll = (message) => JSON.parse(message.rolls[0]);

/**
 * Replace a message's first roll.
 * @param {any} message
 * @param {(roll: any) => void} edit
 */
export function editFirstRoll(message, edit) {
  const roll = firstRoll(message);
  edit(roll);
  message.rolls[0] = JSON.stringify(roll);
  return message;
}
