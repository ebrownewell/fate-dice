// Shared helpers for browser tests.

/**
 * Make a roll as a client and return the id of the chat message holding it.
 * @param {import("playwright").Page} page
 * @param {string} code Runs in the page with `actor` (Player A Hero) in scope; may await.
 */
export const rollAndGetMessageId = (page, code) =>
  page.evaluate(async (body) => {
    const actor = game.actors.getName("Player A Hero");
    const before = new Set(game.messages.keys());
    await new Function("actor", `return (async () => { ${body} })()`)(actor);
    const added = game.messages.contents.filter(
      (/** @type {any} */ m) => !before.has(m.id) && m.rolls.length > 0,
    );
    return added.at(-1)?.id ?? null;
  }, code);

/** Button state of a chat card's Fate Reroll controls. */
export const fateButton = (
  /** @type {import("playwright").Page} */ page,
  /** @type {string} */ id,
) =>
  page.evaluate((messageId) => {
    const el = ui.chat.element.querySelector(`[data-message-id="${messageId}"]`);
    const button = el?.querySelector("button.fate-dice-reroll");
    return {
      rendered: Boolean(el),
      button: button ? { disabled: /** @type {HTMLButtonElement} */ (button).disabled } : null,
    };
  }, id);

/** Fate a message through the API and return the fated message's data. */
export const fateAndRead = async (
  /** @type {import("playwright").Page} */ page,
  /** @type {string} */ id,
) => {
  await page.evaluate((messageId) => game.modules.get("fate-dice").api.fateReroll(messageId), id);
  return page.evaluate((messageId) => {
    const original = game.messages.get(messageId);
    const fated = game.messages.get(original.getFlag("fate-dice", "fatedBy"));
    return {
      original: { total: original.rolls[0].total, natural: original.rolls[0].dice[0].total },
      fated: fated.toObject(),
      fatedTotal: fated.rolls[0].total,
      fatedClass: fated.rolls[0].constructor.name,
      outcome: fated.getFlag("fate-dice", "outcome"),
    };
  }, id);
};
