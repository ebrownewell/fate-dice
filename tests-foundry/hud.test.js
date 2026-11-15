// The player HUD and the GM panel in a real world. Run with `npm run test:foundry`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { joinWorld } from "../tools/foundry/session.js";

const HEROES = ["Player A Hero", "Player B Hero"];

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

/** Set both heroes' points directly and wait until the player sees them. */
const setAll = async (/** @type {number[]} */ values) => {
  await gm.page.evaluate(async ([names, vals]) => {
    for (const [i, name] of names.entries()) {
      await game.actors.getName(name).update({ "flags.fate-dice.points": vals[i] });
    }
  }, /** @type {[string[], number[]]} */ ([HEROES, values]));
  await expect
    .poll(
      () =>
        player.page.evaluate(
          (name) => game.actors.getName(name).getFlag("fate-dice", "points"),
          HEROES[0],
        ),
      {
        timeout: 10_000,
      },
    )
    .toBe(values[0]);
};

/** What the HUD shows on a page. */
const hud = (/** @type {import("playwright").Page} */ page) =>
  page.evaluate(() => {
    const root = document.getElementById("fate-dice-hud");
    return {
      exists: Boolean(root),
      hidden: root?.hidden ?? true,
      text: root?.textContent?.trim() ?? "",
      dots: root?.querySelectorAll(".fate-dice-dot").length ?? 0,
      filled: root?.querySelectorAll(".fate-dice-dot.filled").length ?? 0,
    };
  });

/** The GM panel's rows. */
const panelRows = () =>
  gm.page.evaluate(() =>
    [...document.querySelectorAll("#fate-dice-gm-panel .fate-dice-member")].map((li) => ({
      name: li.querySelector("strong")?.textContent,
      owners: li.querySelector(".owners")?.textContent,
      count: li.querySelector(".fate-dice-member-count")?.textContent?.trim(),
    })),
  );

/** Click a GM panel button for a hero. */
const panelClick = (/** @type {string} */ action, /** @type {string} */ name) =>
  gm.page.evaluate(([act, actorName]) => {
    const id = game.actors.getName(actorName).id;
    /** @type {HTMLButtonElement} */ (
      document.querySelector(`#fate-dice-gm-panel [data-action="${act}"][data-actor-id="${id}"]`)
    ).click();
  }, /** @type {[string, string]} */ ([action, name]));

const pointsOf = (/** @type {string} */ name) =>
  gm.page.evaluate((n) => game.actors.getName(n).getFlag("fate-dice", "points"), name);

beforeAll(async () => {
  gm = await joinWorld();
  player = await joinWorld({ user: "Player A" });
  await player.page.evaluate(() => game.settings.set("fate-dice", "hudPosition", null));
});

afterAll(async () => {
  await player?.page.evaluate(() => game.settings.set("fate-dice", "showHud", true));
  await player?.browser.close();
  await gm?.browser.close();
});

beforeEach(async () => {
  await setAll([1, 1]);
});

describe("player HUD", () => {
  it("shows the player's character's Fate Dice as dots", async () => {
    await expect
      .poll(() => hud(player.page))
      .toMatchObject({
        hidden: false,
        dots: 3,
        filled: 1,
        text: "1 / 3",
      });
  });

  it("updates when the GM awards a Fate Die", async () => {
    await gm.page.evaluate(
      (name) => game.modules.get("fate-dice").api.award(game.actors.getName(name), 1),
      HEROES[0],
    );
    await expect
      .poll(() => hud(player.page), { timeout: 10_000 })
      .toMatchObject({
        filled: 2,
        text: "2 / 3",
      });
  });

  it("opens the player's log when clicked", async () => {
    const opened = await player.page.evaluate(async () => {
      document
        .querySelector("#fate-dice-hud button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      return Boolean(document.getElementById(`fate-dice-log-${game.user.character.id}`));
    });
    expect(opened).toBe(true);
  });

  it("can be dragged, and remembers where", async () => {
    const box = await player.page.locator("#fate-dice-hud").boundingBox();
    if (!box) throw new Error("HUD not on screen");
    await player.page.mouse.move(box.x + 10, box.y + 10);
    await player.page.mouse.down();
    await player.page.mouse.move(box.x + 210, box.y - 150, { steps: 5 });
    await player.page.mouse.up();
    const saved = await player.page.evaluate(() => game.settings.get("fate-dice", "hudPosition"));
    expect(saved.left).toBeCloseTo(box.x + 200, -1);
    expect(saved.top).toBeCloseTo(box.y - 160, -1);
  });

  it("can be hidden in the player's settings", async () => {
    await player.page.evaluate(() => game.settings.set("fate-dice", "showHud", false));
    await expect.poll(() => hud(player.page)).toMatchObject({ hidden: true });
    await player.page.evaluate(() => game.settings.set("fate-dice", "showHud", true));
    await expect.poll(() => hud(player.page)).toMatchObject({ hidden: false });
  });
});

describe("GM panel", () => {
  beforeAll(async () => {
    await gm.page.evaluate(async () => {
      document
        .querySelector("#fate-dice-hud button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 800));
    });
  });

  it("opens from the GM's HUD and lists each player character with owners and Fate Dice", async () => {
    expect((await hud(gm.page)).text).toBe("Fate Dice");
    await expect.poll(panelRows).toEqual([
      { name: "Player A Hero", owners: "Player A", count: "1 / 3" },
      { name: "Player B Hero", owners: "Player B", count: "1 / 3" },
    ]);
  });

  it("+1 and −1 adjust a character, and the panel keeps up", async () => {
    await panelClick("plus", HEROES[1]);
    await expect.poll(() => pointsOf(HEROES[1])).toBe(2);
    await panelClick("minus", HEROES[1]);
    await expect.poll(() => pointsOf(HEROES[1])).toBe(1);
    await expect.poll(async () => (await panelRows())[1].count).toBe("1 / 3");
  });

  it("start of session gives everyone +1, capped, and logs it", async () => {
    await setAll([3, 1]);
    await gm.page.evaluate(() =>
      /** @type {HTMLButtonElement} */ (
        document.querySelector('#fate-dice-gm-panel [data-action="sessionStart"]')
      ).click(),
    );
    await expect.poll(() => pointsOf(HEROES[1])).toBe(2);
    expect(await pointsOf(HEROES[0])).toBe(3);
    const last = await gm.page.evaluate(
      (name) => game.actors.getName(name).getFlag("fate-dice", "log").at(-1),
      HEROES[1],
    );
    expect(last).toMatchObject({ action: "award", delta: 1, reason: "Session start" });
  });

  it("is not available to players", async () => {
    expect((await hud(player.page)).text).not.toBe("Fate Dice");
  });
});
