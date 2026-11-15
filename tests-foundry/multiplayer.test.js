// Multi-client checks: a GM and a player connected at once, talking over
// Foundry's real socket. Run with `npm run test:foundry`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joinWorld } from "../tools/foundry/session.js";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

/**
 * Run a Fate Dice API call in a client and return its result or error code.
 * @param {import("playwright").Page} page
 * @param {string} method
 * @param {string} actorName
 * @param {number} amount
 */
const call = (page, method, actorName, amount) =>
  page.evaluate(
    ([m, name, n]) =>
      game.modules
        .get("fate-dice")
        .api[m](game.actors.getName(name), n)
        .catch((/** @type {any} */ e) => ({ error: e.code })),
    /** @type {[string, string, number]} */ ([method, actorName, amount]),
  );

/** @param {import("playwright").Page} page @param {string} actorName */
const pointsIn = (page, actorName) =>
  page.evaluate(
    (name) => game.modules.get("fate-dice").api.getPoints(game.actors.getName(name)),
    actorName,
  );

beforeAll(async () => {
  gm = await joinWorld();
  player = await joinWorld({ user: "Player A" });
});

afterAll(async () => {
  await player?.browser.close();
  await gm?.browser.close();
});

describe("player requests over the socket", () => {
  it("a player's spend is applied by the GM and synced to both clients", async () => {
    await call(gm.page, "setPoints", "Player A Hero", 2);
    const change = await call(player.page, "spend", "Player A Hero", 1);
    expect(change).toMatchObject({ action: "spend", before: 2, after: 1, delta: -1 });
    await expect.poll(() => pointsIn(player.page, "Player A Hero")).toBe(1);
    await expect.poll(() => pointsIn(gm.page, "Player A Hero")).toBe(1);
  });

  it("a player cannot spend another player's Fate Dice", async () => {
    await call(gm.page, "setPoints", "Player B Hero", 2);
    expect(await call(player.page, "spend", "Player B Hero", 1)).toEqual({
      error: "not-permitted",
    });
    expect(await pointsIn(gm.page, "Player B Hero")).toBe(2);
  });

  it("a player cannot award Fate Dice", async () => {
    expect(await call(player.page, "award", "Player A Hero", 1)).toEqual({
      error: "not-permitted",
    });
  });

  it("a player gets 'no-gm' when the GM is not connected", async () => {
    await gm.browser.close();
    await expect.poll(() => player.page.evaluate(() => game.users.activeGM?.id ?? null)).toBeNull();
    expect(await call(player.page, "spend", "Player A Hero", 1)).toEqual({ error: "no-gm" });
  });
});
