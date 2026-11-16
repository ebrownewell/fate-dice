// The per-character log in a real world: what gets recorded, the log window,
// the sheet button and GM refunds. Run with `npm run test:foundry`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activeSystem, joinWorld } from "../tools/foundry/session.js";

const HERO = "Player A Hero";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

/** Clear the hero's log and set their points (GM only, for test setup). */
const reset = (/** @type {number} */ points) =>
  gm.page.evaluate(async ([name, n]) => {
    const actor = game.actors.getName(name);
    await actor.update({ "flags.fate-dice.log": [], "flags.fate-dice.points": n });
  }, /** @type {[string, number]} */ ([HERO, points]));

/** The hero's stored log, as seen by a client. */
const logOf = (/** @type {import("playwright").Page} */ page) =>
  page.evaluate((name) => game.actors.getName(name).getFlag("fate-dice", "log") ?? [], HERO);

/** Open the hero's log window and read its rows. */
const openLogRows = (/** @type {import("playwright").Page} */ page) =>
  page.evaluate(async (name) => {
    const actor = game.actors.getName(name);
    await game.modules.get("fate-dice").api.openLog(actor);
    const el = document.getElementById(`fate-dice-log-${actor.id}`);
    return [...(el?.querySelectorAll("tbody tr") ?? [])].map((tr) => ({
      what: tr.querySelector(".what")?.textContent?.replace(/\s+/g, " ").trim(),
      delta: tr.querySelector(".delta")?.textContent?.trim(),
      after: tr.querySelector(".after")?.textContent?.trim(),
      by: tr.querySelector(".by")?.textContent?.trim(),
      refundButton: Boolean(tr.querySelector('button[data-action="refund"]')),
    }));
  }, HERO);

// Uses dnd5e rolls: only runs against the dnd5e dev world.
const SYSTEM = await activeSystem();
const skip = SYSTEM !== "dnd5e";

beforeAll(async () => {
  if (skip) return;
  gm = await joinWorld();
  player = await joinWorld({ user: "Player A" });
});

afterAll(async () => {
  if (skip) return;
  await player?.browser.close();
  await gm?.browser.close();
});

describe.skipIf(skip)("what gets logged", () => {
  it("records awards, spends and Fate Rerolls with who and the balance after", async () => {
    await reset(0);
    await gm.page.evaluate(
      (name) => game.modules.get("fate-dice").api.award(game.actors.getName(name), 2),
      HERO,
    );
    await player.page.evaluate(
      (name) => game.modules.get("fate-dice").api.spend(game.actors.getName(name), 1),
      HERO,
    );
    const messageId = await player.page.evaluate(async (name) => {
      const actor = game.actors.getName(name);
      await actor.rollSkill({ skill: "ath" }, { configure: false });
      const id = game.messages.contents.at(-1).id;
      await game.modules.get("fate-dice").api.fateReroll(id);
      return id;
    }, HERO);

    await expect.poll(async () => (await logOf(gm.page)).length).toBe(3);
    const log = await logOf(gm.page);
    expect(log.map((/** @type {any} */ e) => [e.action, e.delta, e.after])).toEqual([
      ["award", 2, 2],
      ["spend", -1, 1],
      ["spend", -1, 0],
    ]);
    expect(log[2].source).toEqual({ type: "reroll", messageId });
  });
});

describe.skipIf(skip)("the log window", () => {
  it("shows the player their history, newest first, without refund buttons", async () => {
    await expect.poll(async () => (await openLogRows(player.page)).length).toBe(3);
    const rows = await openLogRows(player.page);
    expect(rows.map((r) => [r.delta, r.after, r.by])).toEqual([
      ["-1", "0", "Player A"],
      ["-1", "1", "Player A"],
      ["+2", "2", "Test GM"],
    ]);
    expect(rows[0].what).toMatch(/^Fate Reroll view roll$/);
    expect(rows.some((r) => r.refundButton)).toBe(false);
  });

  it("gives the GM refund buttons on spends", async () => {
    const rows = await openLogRows(gm.page);
    expect(rows.map((r) => r.refundButton)).toEqual([true, true, false]);
  });

  it("is reachable from a Fate Dice button in the character sheet header", async () => {
    const page = player.page;
    const { sheetId, shopId } = await page.evaluate(async (name) => {
      const actor = game.actors.getName(name);
      // Start with no shop open, so we know the button opened it.
      for (const app of foundry.applications.instances.values()) {
        if (app.id === `fate-dice-shop-${actor.id}`) await app.close();
      }
      await actor.sheet.render({ force: true });
      await new Promise((r) => setTimeout(r, 500));
      return { sheetId: actor.sheet.id, shopId: `fate-dice-shop-${actor.id}` };
    }, HERO);

    // Foundry v13 sheets show header buttons directly; v14 puts them in a menu.
    const direct = page.locator(`#${sheetId} [data-action="fateDiceLog"] button`);
    if (await direct.count()) {
      await direct.click();
    } else {
      await page.locator(`#${sheetId} [data-action="toggleControls"]`).click();
      await page.locator("li.context-item", { hasText: "Fate Dice" }).click();
    }
    await expect
      .poll(() => page.evaluate((id) => Boolean(document.getElementById(id)), shopId))
      .toBe(true);
    await page.evaluate((name) => game.actors.getName(name).sheet.close(), HERO);
  });
});

describe.skipIf(skip)("refunds", () => {
  it("lets the GM refund a spend from the log, and both clients see it", async () => {
    const spendId = (await logOf(gm.page))[1].id; // the plain spend of 1
    await gm.page.evaluate(
      ([name, id]) => game.modules.get("fate-dice").api.refundEntry(game.actors.getName(name), id),
      /** @type {[string, string]} */ ([HERO, spendId]),
    );
    await expect.poll(async () => (await logOf(player.page)).length).toBe(4);
    const log = await logOf(player.page);
    const refund = log.at(-1);
    expect(refund).toMatchObject({ action: "refund", delta: 1, after: 1, refundOf: spendId });
    expect(log[1].refundedBy).toBe(refund.id);

    const rows = await openLogRows(player.page);
    expect(rows[0]).toMatchObject({ delta: "+1", what: "Refund" });
    expect(rows[2].what).toContain("(refunded)");
  });

  it("refuses to refund the same spend twice", async () => {
    const spendId = (await logOf(gm.page))[1].id;
    const code = await gm.page.evaluate(
      ([name, id]) =>
        game.modules
          .get("fate-dice")
          .api.refundEntry(game.actors.getName(name), id)
          .catch((/** @type {any} */ e) => e.code),
      /** @type {[string, string]} */ ([HERO, spendId]),
    );
    expect(code).toBe("invalid");
  });

  it("does not let a player refund", async () => {
    const spendId = (await logOf(gm.page))[2].id; // the reroll
    const code = await player.page.evaluate(
      ([name, id]) =>
        game.modules
          .get("fate-dice")
          .api.refundEntry(game.actors.getName(name), id)
          .catch((/** @type {any} */ e) => e.code),
      /** @type {[string, string]} */ ([HERO, spendId]),
    );
    expect(code).toBe("not-permitted");
  });
});
