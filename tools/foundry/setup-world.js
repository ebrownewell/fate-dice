// @ts-check
// Prepare the dev world for testing. Safe to run repeatedly.
//   node tools/foundry/setup-world.js
//
// - enables Fate Dice and Quench
// - creates a "Test GM" account for automation
// - creates players "Player A" and "Player B" (no passwords; local dev only)
// - gives each a dnd5e character with a longsword and 20 HP

import { TEST_GM, joinWorld, waitForReady } from "./session.js";

// The first run has no Test GM yet, so it joins as the world's Gamemaster.
const { browser, page } = await joinWorld({
  user: process.env.FOUNDRY_SETUP_USER ?? TEST_GM,
}).catch(() => joinWorld({ user: "Gamemaster" }));

const needsReload = await page.evaluate(async () => {
  const key = "moduleConfiguration";
  const config = game.settings.get("core", key);
  if (config["fate-dice"] && config.quench) return false;
  await game.settings.set("core", key, { ...config, "fate-dice": true, quench: true });
  return true;
});
if (needsReload) {
  await page.reload();
  await waitForReady(page);
}

const summary = await page.evaluate(async (testGm) => {
  if (!game.users.getName(testGm)) {
    await User.create({ name: testGm, role: CONST.USER_ROLES.GAMEMASTER, password: "" });
  }
  const PLAYERS = ["Player A", "Player B"];
  for (const name of PLAYERS) {
    if (!game.users.getName(name)) {
      await User.create({ name, role: CONST.USER_ROLES.PLAYER, password: "" });
    }
  }

  /** Find a longsword in any Item compendium. */
  async function findLongsword() {
    for (const pack of game.packs.filter((/** @type {any} */ p) => p.documentName === "Item")) {
      const entry = pack.index.find(
        (/** @type {any} */ e) => e.name === "Longsword" && e.type === "weapon",
      );
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error("No Longsword found in any Item compendium");
  }

  const longsword = await findLongsword();
  for (const playerName of PLAYERS) {
    const user = game.users.getName(playerName);
    const actorName = `${playerName} Hero`;
    let actor = game.actors.getName(actorName);
    if (!actor) {
      actor = await Actor.create({
        name: actorName,
        type: "character",
        ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      });
    }
    if (!actor.items.getName("Longsword")) await actor.createEmbeddedDocuments("Item", [longsword]);
    // Classless characters have 0 max HP; give them some so revives and healing work.
    if (actor.system.attributes.hp.max < 20) {
      await actor.update({ "system.attributes.hp.max": 20, "system.attributes.hp.value": 20 });
    }
    if (user.character?.id !== actor.id) await user.update({ character: actor.id });
  }

  return {
    modules: ["fate-dice", "quench"].map((id) => `${id}: ${game.modules.get(id).active}`),
    api: typeof game.modules.get("fate-dice").api,
    users: game.users.map((/** @type {any} */ u) => `${u.name} → ${u.character?.name ?? "-"}`),
  };
}, TEST_GM);

console.log(summary);
await browser.close();
