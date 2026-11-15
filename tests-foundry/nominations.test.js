// Nominations with four people online: the GM and Players A, B and C.
// Run with `npm run test:foundry`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { joinWorld } from "../tools/foundry/session.js";

/** @type {Record<string, Awaited<ReturnType<typeof joinWorld>>>} */
const clients = {};
const page = (/** @type {string} */ who) => clients[who].page;

/** Set a world setting as the GM. */
const setSetting = (/** @type {string} */ key, /** @type {unknown} */ value) =>
  page("gm").evaluate(
    ([k, v]) => game.settings.set("fate-dice", k, v),
    /** @type {[string, any]} */ ([key, value]),
  );

const points = (/** @type {string} */ hero) =>
  page("gm").evaluate(
    (name) => game.actors.getName(name).getFlag("fate-dice", "points") ?? 0,
    hero,
  );

/** Nominate through the real dialog. */
async function nominateViaDialog(
  /** @type {string} */ who,
  /** @type {string} */ hero,
  /** @type {string} */ reason,
) {
  // Don't await the dialog: it only resolves once it closes.
  await page(who).evaluate(() => {
    game.modules.get("fate-dice").api.openNominate();
  });
  await page(who).evaluate(
    async ([heroName, why]) => {
      for (let i = 0; i < 50; i++) {
        const dialog = [...document.querySelectorAll("dialog.application, .application.dialog")].at(
          -1,
        );
        if (dialog) {
          const select = /** @type {HTMLSelectElement} */ (
            dialog.querySelector('[name="actorId"]')
          );
          select.value = game.actors.getName(heroName).id;
          /** @type {HTMLTextAreaElement} */ (dialog.querySelector('[name="reason"]')).value = why;
          /** @type {HTMLButtonElement} */ (
            dialog.querySelector('button[data-action="ok"]')
          ).click();
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("No nominate dialog");
    },
    [hero, reason],
  );
}

/** The newest nomination card as a client sees it. */
const card = (/** @type {string} */ who) =>
  page(who).evaluate(() => {
    const message = game.messages.contents
      .filter((/** @type {any} */ m) => m.getFlag("fate-dice", "nomination"))
      .at(-1);
    if (!message) return null;
    const el = ui.chat.element.querySelector(`[data-message-id="${message.id}"]`);
    return {
      status: message.getFlag("fate-dice", "nomination").status,
      text: el?.querySelector(".fate-dice-nomination p")?.textContent ?? null,
      buttons: [...(el?.querySelectorAll(".fate-dice-nomination-controls button") ?? [])].map(
        (b) => b.textContent,
      ),
      label: el?.querySelector(".fate-dice-nomination-status")?.textContent ?? null,
      tally: el?.querySelector(".fate-dice-nomination-tally")?.textContent ?? null,
    };
  });

/** Click a button on the newest nomination card. */
const clickCard = (/** @type {string} */ who, /** @type {string} */ label) =>
  page(who).evaluate((text) => {
    const message = game.messages.contents
      .filter((/** @type {any} */ m) => m.getFlag("fate-dice", "nomination"))
      .at(-1);
    const el = ui.chat.element.querySelector(`[data-message-id="${message.id}"]`);
    const button = [...el.querySelectorAll(".fate-dice-nomination-controls button")].find(
      (b) => b.textContent === text,
    );
    if (!button) throw new Error(`No "${text}" button`);
    button.click();
  }, label);

beforeAll(async () => {
  clients.gm = await joinWorld();
  clients.a = await joinWorld({ user: "Player A" });
  clients.b = await joinWorld({ user: "Player B" });
  clients.c = await joinWorld({ user: "Player C" });
});

afterAll(async () => {
  await setSetting("nominationMode", "gm");
  await setSetting("nominationLimit", 1);
  await Promise.all(Object.values(clients).map((c) => c.browser.close()));
});

beforeEach(async () => {
  await page("gm").evaluate(async () => {
    const ids = game.messages
      .filter((/** @type {any} */ m) => m.getFlag("fate-dice", "nomination"))
      .map((/** @type {any} */ m) => m.id);
    await ChatMessage.deleteDocuments(ids);
    for (const name of ["Player A Hero", "Player B Hero", "Player C Hero"]) {
      await game.actors.getName(name).update({ "flags.fate-dice.points": 1 });
    }
  });
});

describe("GM approval", () => {
  beforeAll(async () => {
    await setSetting("nominationMode", "gm");
    await setSetting("nominationLimit", 1);
  });

  it("a player nominates through the dialog; others see it waiting; the GM approves and the nominee gains a Fate Die", async () => {
    await nominateViaDialog("a", "Player B Hero", "Held the bridge alone");
    await expect
      .poll(() => card("b"))
      .toMatchObject({
        status: "pending",
        text: "Player A nominates Player B Hero for a Fate Die",
        label: "Waiting for the GM",
        buttons: [],
      });
    await expect.poll(() => card("gm")).toMatchObject({ buttons: ["Approve", "Deny"] });

    await clickCard("gm", "Approve");
    await expect.poll(() => points("Player B Hero")).toBe(2);
    await expect
      .poll(() => card("c"))
      .toMatchObject({ status: "approved", label: "Approved: +1 Fate Die" });
    const last = await page("gm").evaluate(() =>
      game.actors.getName("Player B Hero").getFlag("fate-dice", "log").at(-1),
    );
    expect(last).toMatchObject({
      action: "award",
      reason: "Nominated by Player A: Held the bridge alone",
    });
  });

  it("the GM can deny", async () => {
    await nominateViaDialog("a", "Player C Hero", "Good joke");
    await expect.poll(() => card("gm")).toMatchObject({ buttons: ["Approve", "Deny"] });
    await clickCard("gm", "Deny");
    await expect.poll(() => card("a")).toMatchObject({ status: "rejected", label: "Not approved" });
    expect(await points("Player C Hero")).toBe(1);
  });

  it("refuses self-nomination and a second nomination in the same session", async () => {
    const self = await page("a").evaluate(() =>
      game.modules
        .get("fate-dice")
        .api.nominate(game.actors.getName("Player A Hero"), "me!")
        .catch((/** @type {any} */ e) => e.code),
    );
    expect(self).toBe("not-permitted");
    await page("gm").evaluate(() =>
      game.settings.set("fate-dice", "session", game.settings.get("fate-dice", "session") + 1),
    );
    await page("a").evaluate(() =>
      game.modules.get("fate-dice").api.nominate(game.actors.getName("Player B Hero"), "first"),
    );
    const second = await page("a").evaluate(() =>
      game.modules
        .get("fate-dice")
        .api.nominate(game.actors.getName("Player C Hero"), "second")
        .catch((/** @type {any} */ e) => e.code),
    );
    expect(second).toBe("limit-reached");
  });
});

describe("party vote", () => {
  beforeAll(async () => {
    await setSetting("nominationMode", "vote");
    await setSetting("nominationLimit", 0);
  });

  it("the nominee's owner can't vote; the vote passes when the others agree", async () => {
    await page("a").evaluate(() =>
      game.modules.get("fate-dice").api.nominate(game.actors.getName("Player B Hero"), "Saved us"),
    );
    // Eligible: A (nominator, yes) and C. B owns the nominee.
    await expect
      .poll(() => card("b"))
      .toMatchObject({ tally: "1 yes, 0 no (2 voting)", buttons: [] });
    await expect.poll(() => card("c")).toMatchObject({ buttons: ["Yes", "No"] });
    await expect.poll(() => card("gm")).toMatchObject({ buttons: ["Accept result now"] });

    await clickCard("c", "Yes");
    await expect.poll(() => card("a")).toMatchObject({ status: "approved" });
    await expect.poll(() => points("Player B Hero")).toBe(2);
  });

  it("a tie fails", async () => {
    await page("a").evaluate(() =>
      game.modules.get("fate-dice").api.nominate(game.actors.getName("Player B Hero"), "Again"),
    );
    await expect.poll(() => card("c")).toMatchObject({ buttons: ["Yes", "No"] });
    await clickCard("c", "No");
    await expect.poll(() => card("a")).toMatchObject({ status: "rejected" });
    expect(await points("Player B Hero")).toBe(1);
  });

  it("the GM can accept the result before everyone has voted", async () => {
    await page("a").evaluate(() =>
      game.modules
        .get("fate-dice")
        .api.nominate(game.actors.getName("Player C Hero"), "Quick thinking"),
    );
    await expect.poll(() => card("gm")).toMatchObject({ buttons: ["Accept result now"] });
    await clickCard("gm", "Accept result now");
    await expect.poll(() => card("c")).toMatchObject({ status: "approved" });
    await expect.poll(() => points("Player C Hero")).toBe(2);
  });
});
