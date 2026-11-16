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

/** Make a full attack with the Practice Blade (two attacks) and return its message id. */
const fullAttack = () =>
  player.page.evaluate(async () => {
    const actor = game.actors.getName("Player A Hero");
    const before = new Set(game.messages.keys());
    await actor.items.getName("Practice Blade").use({ skipDialog: true });
    return game.messages.contents.find((/** @type {any} */ m) => !before.has(m.id))?.id;
  });

/** Each attack row of a card: whether it has a Fate button or a "Fated" marker. */
const attackRows = (/** @type {string} */ id) =>
  player.page.evaluate((messageId) => {
    const card = ui.chat.element.querySelector(`[data-message-id="${messageId}"]`);
    return [...(card?.querySelectorAll(".chat-attack[data-index]") ?? [])].map((row) => ({
      index: /** @type {HTMLElement} */ (row).dataset.index,
      button: Boolean(row.querySelector("button.fate-dice-reroll")),
      fated: Boolean(row.querySelector(".fate-dice-fated")),
    }));
  }, id);

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

  it("puts a Fate button in each attack's row of a full attack", async () => {
    const id = await fullAttack();
    await expect
      .poll(() => attackRows(id))
      .toEqual([
        { index: "0", button: true, fated: false },
        { index: "1", button: true, fated: false },
      ]);
  });

  it("fating one attack posts its result, marks only that row, and handles crits", async () => {
    const id = await fullAttack();
    await expect.poll(() => attackRows(id)).toHaveLength(2);
    await player.page.evaluate((messageId) => {
      /** @type {HTMLButtonElement} */ (
        ui.chat.element.querySelector(
          `[data-message-id="${messageId}"] .chat-attack[data-index="1"] button.fate-dice-reroll`,
        )
      ).click();
    }, id);

    await expect
      .poll(() => attackRows(id))
      .toEqual([
        { index: "0", button: true, fated: false },
        { index: "1", button: false, fated: true },
      ]);

    const result = await player.page.evaluate((messageId) => {
      const original = game.messages.get(messageId);
      const fated = game.messages.get(original.getFlag("fate-dice", "fatedTargets")["attack-1"]);
      const attack = original.system.rolls.attacks[1].attack;
      return {
        content: fated.content,
        flags: fated.flags["fate-dice"],
        originalTotal: attack.total,
        originalNatural: attack.terms[0].results.find((/** @type {any} */ r) => r.active).result,
        crit: attack.options.critical,
      };
    }, id);
    const { outcome, roll } = result.flags;
    expect(result.flags.target).toBe("attack-1");
    expect(result.content).toContain(
      `Practice Blade, Second Attack: ${roll.total} (was ${result.originalTotal})`,
    );

    const natural = outcome.result.bonus === 0 ? outcome.result.natural : null;
    const newThreat =
      outcome.kept === "fate" &&
      natural !== null &&
      natural >= result.crit &&
      result.originalNatural < result.crit;
    expect(result.content.includes("Critical threat!")).toBe(newThreat);
    expect(result.flags.confirmDice).toHaveLength(newThreat ? 1 : 0);
    if (outcome.kept === "original") expect(result.content).toContain("The original roll stands.");
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
