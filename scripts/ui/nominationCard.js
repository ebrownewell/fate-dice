// @ts-check
// The nomination chat card: its fixed text, and the live controls/status
// that depend on who is looking. Pure DOM; labels arrive localized.

import { tally } from "../core/nominations.js";
import { escapeHtml } from "./purchaseMessage.js";

/** @typedef {import("../core/nominations.js").Nomination} Nomination */

/**
 * @param {Nomination} nom
 * @param {{ id: string, isGM: boolean }} viewer
 */
export function nominationCardModel(nom, viewer) {
  const open = nom.status === "pending";
  const { yes, no, eligible } = tally(nom);
  return {
    status: nom.status,
    mode: nom.mode,
    canVote: open && nom.mode === "vote" && nom.eligible.includes(viewer.id),
    myVote: viewer.id in nom.votes ? nom.votes[viewer.id] : null,
    canDecide: open && nom.mode === "gm" && viewer.isGM,
    canFinalize: open && nom.mode === "vote" && viewer.isGM,
    tally: { yes, no, eligible },
  };
}

/**
 * The card's fixed content, posted once.
 * @param {{ nominatorName: string, actorName: string, reason: string, template: string }} input
 */
export function buildNominationContent({ nominatorName, actorName, reason, template }) {
  const headline = escapeHtml(template)
    .replace("{nominator}", escapeHtml(nominatorName))
    .replace("{actor}", `<strong>${escapeHtml(actorName)}</strong>`);
  return `<div class="fate-dice-nomination"><p>${headline}</p><blockquote>${escapeHtml(reason)}</blockquote></div>`;
}

/**
 * @typedef {object} NominationLabels
 * @property {string} yes
 * @property {string} no
 * @property {string} approve
 * @property {string} deny
 * @property {string} finalize
 * @property {string} pending
 * @property {string} tally Template with {yes}, {no}, {eligible}.
 * @property {string} approved
 * @property {string} rejected
 */

/**
 * Add (or replace) the live part of a nomination card.
 * @param {HTMLElement} root The message element.
 * @param {ReturnType<typeof nominationCardModel>} model
 * @param {{ labels: NominationLabels, onVote?: (approve: boolean) => Promise<unknown>, onDecide?: (approve: boolean) => Promise<unknown>, onFinalize?: () => Promise<unknown> }} options
 */
export function addNominationControls(root, model, { labels, onVote, onDecide, onFinalize }) {
  root.querySelector(".fate-dice-nomination-controls")?.remove();
  const controls = document.createElement("div");
  controls.className = "fate-dice-nomination-controls";
  (root.querySelector(".message-content") ?? root).append(controls);

  const status = (/** @type {string} */ text) => {
    const span = document.createElement("span");
    span.className = "fate-dice-nomination-status";
    span.textContent = text;
    controls.append(span);
  };

  if (model.status !== "pending") {
    status(model.status === "approved" ? labels.approved : labels.rejected);
    return;
  }

  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const button = (
    /** @type {string} */ text,
    /** @type {(() => Promise<unknown>) | undefined} */ action,
    active = false,
  ) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    if (active) el.classList.add("active");
    el.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!action || el.disabled) return;
      for (const b of buttons) b.disabled = true;
      try {
        await action();
      } catch {
        for (const b of buttons) b.disabled = false;
      }
    });
    buttons.push(el);
    controls.append(el);
  };

  if (model.mode === "vote") {
    const count = document.createElement("span");
    count.className = "fate-dice-nomination-tally";
    count.textContent = labels.tally
      .replace("{yes}", String(model.tally.yes))
      .replace("{no}", String(model.tally.no))
      .replace("{eligible}", String(model.tally.eligible));
    controls.append(count);
    if (model.canVote) {
      button(labels.yes, onVote && (() => onVote(true)), model.myVote === true);
      button(labels.no, onVote && (() => onVote(false)), model.myVote === false);
    }
    if (model.canFinalize) button(labels.finalize, onFinalize);
  } else if (model.canDecide) {
    button(labels.approve, onDecide && (() => onDecide(true)));
    button(labels.deny, onDecide && (() => onDecide(false)));
  } else {
    status(labels.pending);
  }
}
