// @ts-check
// The chat announcement for a shop purchase or a flaw. Everything that a
// player or a shared shop file controls is escaped.

/** @param {string} text */
export const escapeHtml = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * @param {object} input
 * @param {string} input.actorName
 * @param {string} input.itemName
 * @param {string} input.description Plain text.
 * @param {string} input.note
 * @param {number} input.cost
 * @param {number} input.gain
 * @param {{ spent: string, flaw: string }} input.labels Templates with {actor}, {amount}, {item}.
 */
export function buildPurchaseMessage({
  actorName,
  itemName,
  description,
  note,
  cost,
  gain,
  labels,
}) {
  const template = gain > 0 ? labels.flaw : labels.spent;
  const headline = escapeHtml(template)
    .replace("{actor}", escapeHtml(actorName))
    .replace("{amount}", String(gain > 0 ? gain : cost))
    .replace("{item}", `<strong>${escapeHtml(itemName)}</strong>`);
  const parts = [`<div class="fate-dice-purchase">`, `<p>${headline}</p>`];
  if (description) {
    parts.push(
      `<p class="fate-dice-purchase-description">${escapeHtml(description).replaceAll("\n", "<br>")}</p>`,
    );
  }
  if (note) parts.push(`<blockquote>${escapeHtml(note)}</blockquote>`);
  parts.push(`</div>`);
  return parts.join("");
}
