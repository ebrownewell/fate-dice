// @ts-check
// Entry point: wires Foundry hooks to the logic in scripts/rules and
// scripts/core.

export const MODULE_ID = "fate-dice";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Fate Dice`);
});
