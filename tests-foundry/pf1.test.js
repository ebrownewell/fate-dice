// Fate Reroll in a real pf1 world. Run against the pf1 dev world:
//   ~/foundry/start.sh --world=fate-dice-pf1 && npm run test:foundry
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activeSystem, joinWorld } from "../tools/foundry/session.js";
import { fateAndRead, fateButton, rollAndGetMessageId } from "./helpers.js";

const skip = (await activeSystem()) !== "pf1";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

beforeAll(async () => {
  if (skip) return;
  gm = await joinWorld({ canvas: true });
  player = await joinWorld({ user: "Player A", canvas: true });
});

afterAll(async () => {
  if (skip) return;
  await gm?.page.evaluate(() =>
    Combat.deleteDocuments(game.combats.map((/** @type {any} */ c) => c.id)),
  );
  await player?.browser.close();
  await gm?.browser.close();
});

beforeEach(async () => {
  if (skip) return;
  await gm.page.evaluate(() =>
    game.modules.get("fate-dice").api.setPoints(game.actors.getName("Player A Hero"), 3),
  );
});

describe.skipIf(skip)("pf1 Fate Reroll", () => {
  it("offers the button on skills and saves, and fates them correctly", async () => {
    for (const code of [
      'await actor.rollSkill("clm", { skipDialog: true })',
      'await actor.rollSavingThrow("fort", { skipDialog: true })',
    ]) {
      const id = /** @type {string} */ (await rollAndGetMessageId(player.page, code));
      await expect
        .poll(() => fateButton(player.page, id))
        .toMatchObject({ button: { disabled: false } });
      const { fatedTotal, fatedClass, outcome, original } = await fateAndRead(player.page, id);
      expect(fatedClass).toBe("D20RollPF");
      const modifier = original.total - original.natural;
      expect(fatedTotal).toBe(
        outcome.kept === "fate" ? modifier + outcome.result.value : original.total,
      );
    }
  });

  it("gives attack cards no button", async () => {
    const id = await player.page.evaluate(async () => {
      const actor = game.actors.getName("Player A Hero");
      const before = new Set(game.messages.keys());
      await actor.items.getName("Longsword").use({ skipDialog: true });
      return game.messages.contents.find((/** @type {any} */ m) => !before.has(m.id))?.id;
    });
    await expect.poll(() => fateButton(player.page, id)).toMatchObject({ rendered: true });
    expect((await fateButton(player.page, id)).button).toBeNull();
  });

  it("updates the combat tracker when initiative is fated", async () => {
    await gm.page.evaluate(async () => {
      await Combat.deleteDocuments(game.combats.map((/** @type {any} */ c) => c.id));
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments("Combatant", [
        { actorId: game.actors.getName("Player A Hero").id },
      ]);
    });
    await expect.poll(() => player.page.evaluate(() => game.combat?.combatants.size ?? 0)).toBe(1);
    const id = /** @type {string} */ (
      await rollAndGetMessageId(
        player.page,
        "await game.combat.rollInitiative([game.combat.combatants.contents[0].id], { skipDialog: true })",
      )
    );
    const { fatedTotal } = await fateAndRead(player.page, id);
    await expect
      .poll(() => gm.page.evaluate(() => game.combat.combatants.contents[0].initiative))
      .toBe(fatedTotal);
  });
});
