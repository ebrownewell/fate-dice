// @ts-check
// Record real chat messages as test fixtures, for whichever system the
// running world uses (dnd5e, pf2e or pf1).
//   node tools/foundry/record-fixtures.js
// Writes tests/fixtures/<system>/<name>.json. Re-run after a system update and
// the adapter tests will show what changed. Cleans up the messages it creates.
// By default existing files are kept; pass --overwrite to replace them.

import { access, mkdir, writeFile } from "node:fs/promises";
import { joinWorld } from "./session.js";

const overwrite = process.argv.includes("--overwrite");
// Some systems (pf2e) need the canvas for strikes and initiative.
const { browser, page } = await joinWorld({ canvas: true });

const { system, fixtures } = await page.evaluate(async () => {
  const actor = game.actors.getName("Player A Hero");
  if (!actor) throw new Error("Run `npm run foundry:setup` first");

  /** @type {Record<string, any>} */
  const recorded = {};
  /** @type {string[]} */
  const created = [];

  /** Run a roll and capture the chat message it creates. */
  async function record(/** @type {string} */ name, /** @type {() => Promise<unknown>} */ roll) {
    const before = new Set(game.messages.keys());
    await roll();
    const added = game.messages.contents.filter(
      (/** @type {any} */ m) => !before.has(m.id) && m.rolls.length > 0,
    );
    if (added.length !== 1)
      throw new Error(`${name}: expected 1 roll message, got ${added.length}`);
    created.push(
      ...game.messages.contents
        .filter((/** @type {any} */ m) => !before.has(m.id))
        .map((/** @type {any} */ m) => m.id),
    );
    recorded[name] = added[0].toObject();
  }

  /** Roll initiative through a temporary combat. */
  async function recordInitiative() {
    const combat = await Combat.create({});
    try {
      const [combatant] = await combat.createEmbeddedDocuments("Combatant", [
        { actorId: actor.id },
      ]);
      // pf1 asks in a dialog unless told to skip it; other systems ignore the option.
      await record("initiative", () => combat.rollInitiative([combatant.id], { skipDialog: true }));
    } finally {
      await combat.delete();
    }
  }

  /** @type {Record<string, () => Promise<void>>} */
  const recipes = {
    async dnd5e() {
      const attack = actor.items
        .getName("Longsword")
        .system.activities.find((/** @type {any} */ a) => a.type === "attack");
      const noDialog = { configure: false };
      await record("attack-normal", () => attack.rollAttack({}, noDialog));
      await record("attack-advantage", () => attack.rollAttack({ advantage: true }, noDialog));
      await record("attack-disadvantage", () =>
        attack.rollAttack({ disadvantage: true }, noDialog),
      );
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
      await recordInitiative();
    },

    async pf2e() {
      const quiet = { skipDialog: true };
      await record("skill-dc", () => actor.skills.athletics.roll({ ...quiet, dc: { value: 15 } }));
      await record("skill", () => actor.skills.athletics.roll(quiet));
      await record("skill-fortune", () =>
        actor.skills.athletics.roll({ ...quiet, rollTwice: "keep-higher", dc: { value: 15 } }),
      );
      await record("skill-misfortune", () =>
        actor.skills.athletics.roll({ ...quiet, rollTwice: "keep-lower", dc: { value: 15 } }),
      );
      await record("save", () => actor.saves.fortitude.roll(quiet));
      await record("perception", () => actor.perception.roll(quiet));
      const strike = actor.system.actions.find((/** @type {any} */ a) => a.label === "Longsword");
      if (strike) {
        await record("strike", () => strike.variants[0].roll(quiet));
        await record("damage", () => strike.damage(quiet));
      }
      await recordInitiative();
    },

    async pf1() {
      const quiet = { skipDialog: true };
      await record("skill", () => actor.rollSkill("clm", quiet));
      await record("save", () => actor.rollSavingThrow("fort", quiet));
      await record("ability-check", () => actor.rollAbilityTest("str", quiet));
      // Attack cards keep their rolls in message.system, not message.rolls.
      const longsword = actor.items.getName("Longsword");
      if (longsword) {
        const before = new Set(game.messages.keys());
        await longsword.use(quiet);
        const card = game.messages.contents.find((/** @type {any} */ m) => !before.has(m.id));
        if (card) {
          created.push(card.id);
          recorded["attack-card"] = card.toObject();
        }
      }
      await recordInitiative();
    },
  };

  const recipe = recipes[game.system.id];
  if (!recipe) throw new Error(`No fixture recipes for system "${game.system.id}"`);
  await recipe();
  await ChatMessage.deleteDocuments(created);
  return { system: game.system.id, fixtures: recorded };
});

await browser.close();

const outDir = new URL(`../../tests/fixtures/${system}/`, import.meta.url);
await mkdir(outDir, { recursive: true });
for (const [name, message] of Object.entries(fixtures)) {
  const file = new URL(`${name}.json`, outDir);
  const exists = await access(file).then(
    () => true,
    () => false,
  );
  if (exists && !overwrite) {
    console.log(`kept    tests/fixtures/${system}/${name}.json (use --overwrite to replace)`);
    continue;
  }
  await writeFile(file, `${JSON.stringify(message, null, 2)}\n`);
  console.log(`wrote   tests/fixtures/${system}/${name}.json`);
}
