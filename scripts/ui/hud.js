// @ts-check
// The on-screen Fate Dice HUD: dots for a player's character, or a button
// opening the GM panel. Pure DOM; labels arrive localized.

/**
 * @typedef {{ visible: false }
 *   | { visible: true, mode: "gm" }
 *   | { visible: true, mode: "player", name: string, points: number, max: number, dots: boolean[] }} HudModel
 */

/**
 * @param {object} input
 * @param {boolean} input.isGM
 * @param {{ name: string } | null | undefined} input.character The user's assigned character.
 * @param {number} input.points
 * @param {number} input.max
 * @param {boolean} input.show The user's "Show Fate Dice HUD" setting.
 * @returns {HudModel}
 */
export function hudModel({ isGM, character, points, max, show }) {
  if (!show) return { visible: false };
  if (isGM) return { visible: true, mode: "gm" };
  if (!character) return { visible: false };
  const count = Math.max(max, points);
  return {
    visible: true,
    mode: "player",
    name: character.name,
    points,
    max,
    dots: Array.from({ length: count }, (_, i) => i < points),
  };
}

/**
 * @param {HTMLElement} root The HUD element.
 * @param {HudModel} model
 * @param {{ labels: { title: string, gmButton: string, openLog: string }, onOpen?: () => void }} options
 */
export function renderHud(root, model, { labels, onOpen }) {
  root.replaceChildren();
  root.hidden = !model.visible;
  if (!model.visible) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fate-dice-hud-button";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-dice-d20";
  button.append(icon);

  if (model.mode === "gm") {
    button.title = labels.gmButton;
    button.append(document.createTextNode(` ${labels.gmButton}`));
  } else {
    button.title = labels.openLog;
    const dots = document.createElement("span");
    dots.className = "fate-dice-dots";
    for (const filled of model.dots) {
      const dot = document.createElement("span");
      dot.className = filled ? "fate-dice-dot filled" : "fate-dice-dot";
      dots.append(dot);
    }
    const count = document.createElement("span");
    count.className = "fate-dice-hud-count";
    count.textContent = `${model.points} / ${model.max}`;
    button.append(dots, count);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    // A drag ends with a click; don't treat it as one.
    if (root.dataset.dragged) {
      delete root.dataset.dragged;
      return;
    }
    onOpen?.();
  });
  root.append(button);
}

/**
 * Keep the HUD fully on screen. Returns null for a missing or invalid position.
 * @param {{ left: number, top: number } | null | undefined} position
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number }} viewport
 */
export function clampPosition(position, size, viewport) {
  if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return null;
  const clamp = (/** @type {number} */ n, /** @type {number} */ max) =>
    Math.min(Math.max(n, 0), Math.max(max, 0));
  return {
    left: clamp(position.left, viewport.width - size.width),
    top: clamp(position.top, viewport.height - size.height),
  };
}
