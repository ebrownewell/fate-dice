// @ts-check
// Linking a fated roll and its original in the chat log: highlighting the
// partner on hover, and jumping to it on click.

const LINKED = "fate-dice-linked";
const FLASH = "fate-dice-flash";

/**
 * Every element showing a message (the chat log and the notification pane
 * each have a copy). Compares ids directly, so no selector escaping is needed.
 * @param {ParentNode | null | undefined} root
 * @param {string} id
 * @returns {HTMLElement[]}
 */
const copiesOf = (root, id) =>
  /** @type {HTMLElement[]} */ ([...(root?.querySelectorAll("[data-message-id]") ?? [])]).filter(
    (el) => el.dataset.messageId === id,
  );

/**
 * Outline (or stop outlining) every on-screen copy of some messages.
 * @param {ParentNode} root Usually `document`.
 * @param {string[]} messageIds
 * @param {boolean} on
 * @returns {number} How many elements changed.
 */
export function highlightMessages(root, messageIds, on) {
  let count = 0;
  for (const id of messageIds) {
    for (const el of copiesOf(root, id)) {
      el.classList.toggle(LINKED, on);
      count += 1;
    }
  }
  return count;
}

/**
 * Scroll a message into view and flash it.
 * @param {ParentNode} root Usually `document`.
 * @param {string} messageId
 * @param {{ container?: ParentNode | null, flashMs?: number }} [options]
 *   container: prefer the copy inside it (the chat log).
 * @returns {boolean} false if the message isn't on screen.
 */
export function jumpToMessage(root, messageId, { container, flashMs = 1600 } = {}) {
  const el = copiesOf(container, messageId)[0] ?? copiesOf(root, messageId)[0];
  if (!el) return false;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.classList.add(FLASH);
  setTimeout(() => el.classList.remove(FLASH), flashMs);
  return true;
}
