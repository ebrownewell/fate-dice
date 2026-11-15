// The shop in a real world: import, buying through the UI, limits, flaws,
// sessions and export. Run with `npm run test:foundry`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joinWorld } from "../tools/foundry/session.js";

const HERO = "Player A Hero";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

/** Click the OK/default button of the newest open dialog, after filling fields. */
const answerDialog = (
  /** @type {import("playwright").Page} */ page,
  /** @type {Record<string, string>} */ fields = {},
) =>
  page.evaluate(async (values) => {
    for (let i = 0; i < 50; i++) {
      const dialogs = [...document.querySelectorAll("dialog.application, .application.dialog")];
      const dialog = dialogs.at(-1);
      if (dialog) {
        for (const [name, value] of Object.entries(values)) {
          const field = /** @type {HTMLInputElement} */ (dialog.querySelector(`[name="${name}"]`));
          field.value = value;
        }
        /** @type {HTMLButtonElement} */ (
          dialog.querySelector('button[data-action="ok"], button.default, footer button')
        ).click();
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("No dialog appeared");
  }, fields);

/** The shop window's items as the player sees them. */
const shopItems = () =>
  player.page.evaluate((name) => {
    const id = game.actors.getName(name).id;
    return [
      ...document.querySelectorAll(`#fate-dice-shop-${id} .fate-dice-shop-item:not(.builtin)`),
    ].map((li) => ({
      name: li.querySelector("strong")?.textContent,
      price: li.querySelector(".price")?.textContent?.trim(),
      disabled: /** @type {HTMLButtonElement} */ (li.querySelector("button"))?.disabled,
      reason: li.querySelector(".reason")?.textContent ?? null,
    }));
  }, HERO);

const pointsOf = () =>
  gm.page.evaluate((name) => game.actors.getName(name).getFlag("fate-dice", "points"), HERO);

/** Click Buy/Take on an item in the player's shop, then answer the dialog. */
async function buy(/** @type {string} */ itemName, note = "") {
  await player.page.evaluate(
    ([actorName, item]) => {
      const id = game.actors.getName(actorName).id;
      const li = [...document.querySelectorAll(`#fate-dice-shop-${id} .fate-dice-shop-item`)].find(
        (el) => el.querySelector("strong")?.textContent === item,
      );
      const button = li?.querySelector('[data-action="buy"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error(`No Buy button for ${item}`);
      button.click();
    },
    [HERO, itemName],
  );
  await answerDialog(player.page, { note });
}

beforeAll(async () => {
  gm = await joinWorld();
  player = await joinWorld({ user: "Player A" });
  await gm.page.evaluate(async (name) => {
    await game.settings.set("fate-dice", "shop", { items: [] });
    await game.settings.set("fate-dice", "session", 1);
    await game.actors
      .getName(name)
      .update({ "flags.fate-dice.points": 3, "flags.fate-dice.log": [] });
  }, HERO);
});

afterAll(async () => {
  await player?.browser.close();
  await gm?.browser.close();
});

describe("loading a shop", () => {
  it("the GM can load the example shop through the import preview", async () => {
    await gm.page.evaluate(() => game.modules.get("fate-dice").api.openShopEditor());
    await gm.page.evaluate(() =>
      /** @type {HTMLButtonElement} */ (
        document.querySelector('#fate-dice-shop-editor [data-action="example"]')
      ).click(),
    );
    await answerDialog(gm.page);
    await expect
      .poll(() => gm.page.evaluate(() => game.settings.get("fate-dice", "shop").items.length))
      .toBe(4);
    const rows = await gm.page.evaluate(
      () => document.querySelectorAll("#fate-dice-shop-editor tbody tr").length,
    );
    expect(rows).toBe(5); // 4 items + the built-in Fate Reroll
  });

  it("the player sees the items with their prices", async () => {
    await player.page.evaluate(() =>
      document
        .querySelector("#fate-dice-hud button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await expect.poll(shopItems).toEqual([
      { name: "Back on Your Feet", price: "2", disabled: false, reason: null },
      { name: "Lucky Find", price: "1", disabled: false, reason: null },
      { name: "Dig Deep", price: "1", disabled: false, reason: null },
      {
        name: "Flaw: Bad Habit",
        price: "+1",
        disabled: true,
        reason: "That character already has the maximum Fate Dice.",
      },
    ]);
  });
});

describe("buying", () => {
  it("spends the cost, announces it in chat and logs it", async () => {
    await buy("Back on Your Feet");
    await expect.poll(pointsOf).toBe(1);
    const last = await gm.page.evaluate(
      (name) => game.actors.getName(name).getFlag("fate-dice", "log").at(-1),
      HERO,
    );
    expect(last).toMatchObject({
      action: "spend",
      delta: -2,
      session: 1,
      source: { type: "shop", name: "Back on Your Feet" },
    });
    const chat = await gm.page.evaluate(() => game.messages.contents.at(-1).content);
    expect(chat).toContain("Player A Hero spent 2 Fate Dice on <strong>Back on Your Feet</strong>");
  });

  it("enforces once per session, and a new session resets it", async () => {
    await gm.page.evaluate(
      (name) => game.actors.getName(name).update({ "flags.fate-dice.points": 3 }),
      HERO,
    );
    await expect
      .poll(async () => (await shopItems())[0])
      .toMatchObject({ disabled: true, reason: "You've reached the limit for that." });

    await gm.page.evaluate(async () => {
      await game.modules.get("fate-dice").api.openPanel();
      await new Promise((r) => setTimeout(r, 500));
      /** @type {HTMLButtonElement} */ (
        document.querySelector('#fate-dice-gm-panel [data-action="sessionStart"]')
      ).click();
    });
    await expect
      .poll(() => gm.page.evaluate(() => game.settings.get("fate-dice", "session")))
      .toBe(2);
    await expect.poll(async () => (await shopItems())[0]).toMatchObject({ disabled: false });
  });

  it("raises the price of a scaling item after each purchase", async () => {
    await buy("Dig Deep");
    await expect.poll(async () => (await shopItems())[2].price).toBe("2");
  });

  it("taking a flaw needs a note and grants a Fate Die", async () => {
    await gm.page.evaluate(
      (name) => game.actors.getName(name).update({ "flags.fate-dice.points": 1 }),
      HERO,
    );
    await expect.poll(async () => (await shopItems())[3]).toMatchObject({ disabled: false });

    await buy("Flaw: Bad Habit", "");
    await expect
      .poll(() =>
        player.page.evaluate(() => document.querySelector("#notifications")?.textContent ?? ""),
      )
      .toContain("That needs a note explaining it.");
    expect(await pointsOf()).toBe(1);

    await buy("Flaw: Bad Habit", "Insulted the duke");
    await expect.poll(pointsOf).toBe(2);
    const last = await gm.page.evaluate(
      (name) => game.actors.getName(name).getFlag("fate-dice", "log").at(-1),
      HERO,
    );
    expect(last).toMatchObject({
      action: "award",
      reason: "Insulted the duke",
      source: { type: "flaw" },
    });
  });
});

describe("exporting", () => {
  it("downloads a shop file the module can read back", async () => {
    const downloadPromise = gm.page.waitForEvent("download");
    await gm.page.evaluate(() =>
      /** @type {HTMLButtonElement} */ (
        document.querySelector('#fate-dice-shop-editor [data-action="export"]')
      ).click(),
    );
    await answerDialog(gm.page); // "include settings?" → yes
    const download = await downloadPromise;
    const path = await download.path();
    const { readFile } = await import("node:fs/promises");
    const file = JSON.parse(await readFile(path, "utf8"));
    expect(file).toMatchObject({ format: "fate-dice-shop", version: 1 });
    expect(file.items).toHaveLength(4);
    expect(file.settings).toMatchObject({ maxPoints: 3, rerollCost: 1 });
  });
});
