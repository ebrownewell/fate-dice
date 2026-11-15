// @ts-check
// Record real dnd5e chat messages as test fixtures.
//   node tools/foundry/record-fixtures.js
// Writes tests/fixtures/dnd5e/<name>.json. Re-run after a dnd5e update and the
// adapter tests will show what changed. Cleans up the messages it creates.

import { mkdir, writeFile } from "node:fs/promises";
import { joinWorld } from "./session.js";

const OUT_DIR = new URL("../../tests/fixtures/dnd5e/", import.meta.url);

const { browser, page } = await joinWorld();

const fixtures = await page.evaluate(async () => {
  const actor = game.actors.getName("Player A Hero");
  if (!actor) throw new Error("Run `npm run foundry:setup` first");
  const attack = actor.items
    .getName("Longsword")
    .system.activities.find((/** @type {any} */ a) => a.type === "attack");
  const noDialog = { configure: false };

  /** @type {Record<string, any>} */
  const recorded = {};
  /** @type {string[]} */
  const created = [];

  /** Run a roll and capture every chat message it creates. */
  async function record(/** @type {string} */ name, /** @type {() => Promise<unknown>} */ roll) {
    const before = new Set(game.messages.keys());
    await roll();
    const added = game.messages.contents.filter((/** @type {any} */ m) => !before.has(m.id));
    if (added.length !== 1) throw new Error(`${name}: expected 1 message, got ${added.length}`);
    created.push(added[0].id);
    recorded[name] = added[0].toObject();
  }

  await record("attack-normal", () => attack.rollAttack({}, noDialog));
  await record("attack-advantage", () => attack.rollAttack({ advantage: true }, noDialog));
  await record("attack-disadvantage", () => attack.rollAttack({ disadvantage: true }, noDialog));
  await record("damage", () => attack.rollDamage({}, noDialog));
  await record("save", () => actor.rollSavingThrow({ ability: "dex" }, noDialog));
  await record("ability-check", () => actor.rollAbilityCheck({ ability: "str" }, noDialog));
  await record("skill", () => actor.rollSkill({ skill: "ath" }, noDialog));
  await record("skill-disadvantage", () =>
    actor.rollSkill({ skill: "ste", disadvantage: true }, noDialog),
  );
  await record("tool", () => actor.rollToolCheck({ tool: "thief", ability: "dex" }, noDialog));

  // Death save: the character must be at 0 HP.
  const hp = actor.system.attributes.hp.value;
  await actor.update({ "system.attributes.hp.value": 0 });
  try {
    await record("death-save", () => actor.rollDeathSave({}, noDialog));
  } finally {
    await actor.update({
      "system.attributes.hp.value": hp,
      "system.attributes.death": { success: 0, failure: 0 },
    });
  }

  // Initiative: roll through a temporary combat.
  const combat = await Combat.create({});
  try {
    const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);
    await record("initiative", () => combat.rollInitiative([combatant.id]));
  } finally {
    await combat.delete();
  }

  await ChatMessage.deleteDocuments(created);
  return recorded;
});

await browser.close();

await mkdir(OUT_DIR, { recursive: true });
for (const [name, message] of Object.entries(fixtures)) {
  await writeFile(new URL(`${name}.json`, OUT_DIR), `${JSON.stringify(message, null, 2)}\n`);
  console.log(`wrote tests/fixtures/dnd5e/${name}.json`);
}
