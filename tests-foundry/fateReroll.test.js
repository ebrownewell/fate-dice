// End-to-end Fate Reroll in a real dnd5e world: a player rolls, clicks the
// button, the GM's client does the work. Run with `npm run test:foundry`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { joinWorld } from "../tools/foundry/session.js";

const HERO = "Player A Hero";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

/** @param {import("playwright").Page} page @param {number} points */
const setPoints = (page, points) =>
  page.evaluate(
    ([name, n]) => game.modules.get("fate-dice").api.setPoints(game.actors.getName(name), n),
    /** @type {[string, number]} */ ([HERO, points]),
  );

/** @param {import("playwright").Page} page */
const getPoints = (page) =>
  page.evaluate(
    (name) => game.modules.get("fate-dice").api.getPoints(game.actors.getName(name)),
    HERO,
  );

/**
 * Make a roll as the player and return the new message's id.
 * @param {"attack" | "damage" | "skill" | "death" | "initiative"} kind
 */
const rollAs = (/** @type {import("playwright").Page} */ page, kind) =>
  page.evaluate(async ([name, rollKind]) => {
    const actor = game.actors.getName(name);
    const attack = actor.items
      .getName("Longsword")
      .system.activities.find((/** @type {any} */ a) => a.type === "attack");
    const before = new Set(game.messages.keys());
    const noDialog = { configure: false };
    if (rollKind === "attack") await attack.rollAttack({}, noDialog);
    if (rollKind === "damage") await attack.rollDamage({}, noDialog);
    if (rollKind === "skill") await actor.rollSkill({ skill: "ath" }, noDialog);
    if (rollKind === "initiative")
      await game.combat.rollInitiative([game.combat.combatants.contents[0].id]);
    const added = game.messages.contents.filter((/** @type {any} */ m) => !before.has(m.id));
    return added.at(-1).id;
  }, /** @type {[string, string]} */ ([HERO, kind]));

/** What the chat log shows for a message: its button, marker and banner. */
const chatCard = (/** @type {import("playwright").Page} */ page, /** @type {string} */ id) =>
  page.evaluate((messageId) => {
    const el = ui.chat.element.querySelector(`[data-message-id="${messageId}"]`);
    const button = el?.querySelector("button.fate-dice-reroll");
    return {
      rendered: Boolean(el),
      button: button ? { text: button.textContent.trim(), disabled: button.disabled } : null,
      fated: el?.querySelector(".fate-dice-fated")?.textContent ?? null,
      banner: el?.querySelector(".fate-dice-banner")?.textContent ?? null,
    };
  }, id);

/** @param {import("playwright").Page} page @param {string} id */
const clickFate = (page, id) =>
  page.evaluate((messageId) => {
    ui.chat.element
      .querySelector(`[data-message-id="${messageId}"] button.fate-dice-reroll`)
      .click();
  }, id);

/** Wait for the fated result of a message and return both messages' data. */
const fatedResultOf = async (
  /** @type {import("playwright").Page} */ page,
  /** @type {string} */ id,
) => {
  await expect
    .poll(
      () =>
        page.evaluate((mid) => game.messages.get(mid)?.getFlag("fate-dice", "fatedBy") ?? null, id),
      {
        timeout: 15_000,
      },
    )
    .not.toBeNull();
  return page.evaluate((mid) => {
    const original = game.messages.get(mid);
    const fated = game.messages.get(original.getFlag("fate-dice", "fatedBy"));
    return {
      originalTotal: original.rolls[0].total,
      keptNatural: original.rolls[0].dice[0].total,
      fatedTotal: fated.rolls[0].total,
      fatedFrom: fated.getFlag("fate-dice", "fatedFrom"),
      outcome: fated.getFlag("fate-dice", "outcome"),
      isCritical: fated.rolls[0].isCritical,
      isFumble: fated.rolls[0].isFumble,
      fatedId: fated.id,
      author: fated.author.name,
    };
  }, id);
};

beforeAll(async () => {
  gm = await joinWorld();
  player = await joinWorld({ user: "Player A" });
});

afterAll(async () => {
  await gm?.page.evaluate(() =>
    Promise.all(game.combats.map((/** @type {any} */ c) => c.delete())),
  );
  await player?.browser.close();
  await gm?.browser.close();
});

beforeEach(async () => {
  await setPoints(gm.page, 2);
});

describe("Fate Reroll button", () => {
  it("appears on the player's own d20 roll, showing the cost", async () => {
    const id = await rollAs(player.page, "attack");
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({
        button: { text: "Fate Reroll (1)", disabled: false },
      });
  });

  it("does not appear on damage rolls", async () => {
    const id = await rollAs(player.page, "damage");
    await expect.poll(() => chatCard(player.page, id)).toMatchObject({ rendered: true });
    expect((await chatCard(player.page, id)).button).toBeNull();
  });

  it("is disabled when the character has no Fate Dice", async () => {
    await setPoints(gm.page, 0);
    const id = await rollAs(player.page, "skill");
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({
        button: { disabled: true },
      });
  });

  it("enables itself once the character gets a Fate Die", async () => {
    await setPoints(gm.page, 0);
    const id = await rollAs(player.page, "skill");
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({ button: { disabled: true } });
    await setPoints(gm.page, 1);
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({ button: { disabled: false } });
  });
});

describe("clicking Fate Reroll", () => {
  it("spends a Fate Die and posts a correct fated roll from the player", async () => {
    const id = await rollAs(player.page, "attack");
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({ button: { disabled: false } });
    await clickFate(player.page, id);

    const result = await fatedResultOf(player.page, id);
    expect(await getPoints(player.page)).toBe(1);
    expect(result.fatedFrom).toBe(id);
    expect(result.author).toBe("Player A");

    const modifier = result.originalTotal - result.keptNatural;
    const expectedTotal =
      result.outcome.kept === "fate"
        ? modifier + result.outcome.result.value
        : result.originalTotal;
    expect(result.fatedTotal).toBe(expectedTotal);
    expect(result.isCritical).toBe(result.outcome.isCritical);
    expect(result.isFumble).toBe(result.outcome.isFumble);
  });

  it("marks the original as fated and bannerises the result, for everyone", async () => {
    const id = await rollAs(player.page, "attack");
    await expect
      .poll(() => chatCard(player.page, id))
      .toMatchObject({ button: { disabled: false } });
    await clickFate(player.page, id);
    const { fatedId } = await fatedResultOf(player.page, id);

    for (const page of [player.page, gm.page]) {
      await expect.poll(() => chatCard(page, id)).toMatchObject({ button: null, fated: "Fated" });
      await expect
        .poll(async () => (await chatCard(page, fatedId)).banner ?? "")
        .toMatch(/^Fate Reroll: \d+( → \d+ \(\+\d+\))?, (kept|not kept)$/);
    }
    // The fated result itself can't be fated again.
    expect((await chatCard(player.page, fatedId)).button).toBeNull();
  });

  it("refuses a second Fate Reroll on the same roll", async () => {
    const id = await rollAs(player.page, "attack");
    await player.page.evaluate((mid) => game.modules.get("fate-dice").api.fateReroll(mid), id);
    const code = await player.page.evaluate(
      (mid) =>
        game.modules
          .get("fate-dice")
          .api.fateReroll(mid)
          .catch((/** @type {any} */ e) => e.code),
      id,
    );
    expect(code).toBe("not-fateable");
    expect(await getPoints(player.page)).toBe(1);
  });
});

describe("Fate Reroll on initiative", () => {
  it("updates the combat tracker to the fated total", async () => {
    await gm.page.evaluate(async (name) => {
      for (const c of game.combats) await c.delete();
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments("Combatant", [
        { actorId: game.actors.getName(name).id },
      ]);
    }, HERO);
    await expect.poll(() => player.page.evaluate(() => game.combat?.combatants.size ?? 0)).toBe(1);

    const id = await rollAs(player.page, "initiative");
    await player.page.evaluate((mid) => game.modules.get("fate-dice").api.fateReroll(mid), id);
    const { fatedTotal } = await fatedResultOf(player.page, id);
    await expect
      .poll(() => gm.page.evaluate(() => game.combat.combatants.contents[0].initiative))
      .toBe(fatedTotal);
  });
});
