// Fate Reroll in a real pf2e world. Run against the pf2e dev world:
//   ~/foundry/start.sh --world=fate-dice-pf2e && npm run test:foundry
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activeSystem, joinWorld } from "../tools/foundry/session.js";
import { degreeOfSuccess, DEGREE_NAMES } from "../scripts/rules/pf2eDegree.js";
import { fateAndRead, fateButton, rollAndGetMessageId } from "./helpers.js";

const skip = (await activeSystem()) !== "pf2e";

/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let gm;
/** @type {Awaited<ReturnType<typeof joinWorld>>} */
let player;

beforeAll(async () => {
  if (skip) return;
  // pf2e needs the canvas for strikes and initiative.
  gm = await joinWorld({ canvas: true });
  player = await joinWorld({ user: "Player A", canvas: true });
});

afterAll(async () => {
  if (skip) return;
  await player?.browser.close();
  await gm?.browser.close();
});

beforeEach(async () => {
  if (skip) return;
  await gm.page.evaluate(() =>
    game.modules.get("fate-dice").api.setPoints(game.actors.getName("Player A Hero"), 3),
  );
});

describe.skipIf(skip)("pf2e Fate Reroll", () => {
  it("offers the button on a player's check", async () => {
    const id = await rollAndGetMessageId(
      player.page,
      "await actor.skills.athletics.roll({ skipDialog: true })",
    );
    await expect
      .poll(() => fateButton(player.page, /** @type {string} */ (id)))
      .toMatchObject({
        button: { disabled: false },
      });
  });

  it("recomputes the degree of success against the DC, on the card and in pf2e's data", async () => {
    const id = /** @type {string} */ (
      await rollAndGetMessageId(
        player.page,
        "await actor.skills.athletics.roll({ skipDialog: true, dc: { value: 15 } })",
      )
    );
    const { fated, fatedTotal, fatedClass, outcome } = await fateAndRead(player.page, id);
    expect(fatedClass).toBe("CheckRoll");
    const expected = degreeOfSuccess({
      total: fatedTotal,
      dc: 15,
      natural: outcome.result.natural,
      boosted: outcome.result.bonus > 0,
    });
    expect(fated.flags.pf2e.context.outcome).toBe(DEGREE_NAMES[expected]);
    expect(JSON.parse(fated.rolls[0]).options.degreeOfSuccess).toBe(expected);
    expect(fated.flavor).toContain(`<span class="${DEGREE_NAMES[expected]}">`);
  });

  it("treats a fortune roll as advantage", async () => {
    const id = /** @type {string} */ (
      await rollAndGetMessageId(
        player.page,
        'await actor.skills.athletics.roll({ skipDialog: true, rollTwice: "keep-higher" })',
      )
    );
    const { outcome, fatedTotal, original } = await fateAndRead(player.page, id);
    // Advantage compares against the higher die, which is the one the original kept.
    expect(outcome.against.natural).toBe(original.natural);
    expect(fatedTotal).toBe(
      Math.max(outcome.fate.value, original.natural) + (original.total - original.natural),
    );
  });

  it("works on strikes", async () => {
    const id = /** @type {string} */ (
      await rollAndGetMessageId(
        player.page,
        'await actor.system.actions.find((a) => a.label === "Longsword").variants[0].roll({ skipDialog: true })',
      )
    );
    await expect
      .poll(() => fateButton(player.page, id))
      .toMatchObject({ button: { disabled: false } });
  });

  it("hides pf2e's own Hero Point reroll from the chat menu, unless the GM turns that off", async () => {
    const menu = () =>
      player.page.evaluate(() => {
        const options = ui.chat._getEntryContextOptions();
        Hooks.call("getChatMessageContextOptions", ui.chat, options);
        return options.map((/** @type {any} */ o) => o.name ?? o.label);
      });
    const setHidden = (/** @type {boolean} */ on) =>
      gm.page.evaluate((v) => game.settings.set("fate-dice", "hidePf2eHeroPointReroll", v), on);
    try {
      // Start from the default, whatever an earlier run left behind.
      await setHidden(true);
      await expect.poll(menu).not.toContain("PF2E.RerollMenu.HeroPoint");
      await setHidden(false);
      await expect.poll(menu).toContain("PF2E.RerollMenu.HeroPoint");
    } finally {
      await setHidden(true);
    }
  });
});
