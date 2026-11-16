// @ts-check
// DOM for chat cards: the Fate Reroll button on rolls, and the banner on a
// fated result. Pure DOM, no Foundry globals; labels arrive localized.

/** @typedef {import("../core/fateRerollPolicy.js").ButtonState} ButtonState */
/** @typedef {import("../rules/fateReroll.js").FateRerollResult} FateRerollResult */
/** @typedef {import("../rules/fateReroll.js").FateDie} FateDie */

/**
 * @typedef {object} ChatCardLabels
 * @property {string} reroll Button text.
 * @property {string} fated Marker on an already-fated roll.
 * @property {string} banner Banner prefix on a fated result.
 * @property {string} kept
 * @property {string} notKept
 * @property {Record<string, string>} reasons Tooltip for each disabled reason.
 * @property {string} [was] "was {total}", after the banner.
 * @property {string} [original] Text of the link back to the original.
 * @property {string} [viewOriginal] Tooltip of that link.
 * @property {string} [viewFated] Tooltip of the "Fated" marker's link.
 */

const CONTROLS = "fate-dice-controls";
const BANNER = "fate-dice-banner";

/** @param {HTMLElement} root */
const contentOf = (root) => root.querySelector(".message-content") ?? root;

/**
 * "7 → 17 (+10)" when a bonus applied, otherwise just the number.
 * @param {FateDie} die
 */
export const describeFateDie = (die) =>
  die.bonus > 0 ? `${die.natural} → ${die.value} (+${die.bonus})` : `${die.natural}`;

/**
 * Add (or replace) the Fate Reroll controls on a rendered roll message.
 * @param {HTMLElement} root The message element.
 * @param {ButtonState} state
 * @param {{ cost: number, labels: ChatCardLabels, onClick?: () => Promise<unknown>, onJump?: () => void }} options
 *   onJump: makes the "Fated" marker a link to the fated roll.
 */
export function addFateControls(root, state, { cost, labels, onClick, onJump }) {
  root.querySelector(`.${CONTROLS}`)?.remove();
  if (!state.visible && !("fated" in state && state.fated)) return;

  const controls = document.createElement("div");
  controls.className = CONTROLS;

  if (!state.visible) {
    const marker = document.createElement(onJump ? "a" : "span");
    marker.className = "fate-dice-fated";
    marker.textContent = labels.fated;
    if (onJump) {
      marker.title = labels.viewFated ?? "";
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        onJump();
      });
    }
    controls.append(marker);
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fate-dice-reroll";
    button.textContent = `${labels.reroll} (${cost})`;
    if (!state.enabled) {
      button.disabled = true;
      button.title = labels.reasons[state.reason] ?? "";
    } else if (onClick) {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        try {
          await onClick();
        } catch {
          button.disabled = false;
        }
      });
    }
    controls.append(button);
  }

  contentOf(root).append(controls);
}

/**
 * Add (or replace) the banner explaining a fated result.
 * @param {HTMLElement} root The message element.
 * @param {FateRerollResult} outcome
 * @param {ChatCardLabels} labels
 * @param {{ originalTotal?: number, onJump?: () => void }} [options]
 *   originalTotal adds "· was N"; onJump adds a link back to the original.
 */
export function addFateBanner(root, outcome, labels, { originalTotal, onJump } = {}) {
  root.querySelector(`.${BANNER}`)?.remove();
  const banner = document.createElement("div");
  banner.className = BANNER;
  const kept = outcome.kept === "fate" ? labels.kept : labels.notKept;
  let text = `${labels.banner}: ${describeFateDie(outcome.fate)}, ${kept}`;
  if (typeof originalTotal === "number" && labels.was) {
    text += ` · ${labels.was.replace("{total}", String(originalTotal))}`;
  }
  banner.textContent = text;
  if (onJump) {
    const link = document.createElement("a");
    link.className = "fate-dice-jump";
    link.title = labels.viewOriginal ?? "";
    link.textContent = ` ↩ ${labels.original ?? ""}`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      onJump();
    });
    banner.append(link);
  }
  contentOf(root).prepend(banner);
}
