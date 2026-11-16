// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { highlightMessages, jumpToMessage } from "../../scripts/ui/chatLinks.js";

beforeEach(() => {
  // Foundry shows a message in the chat log and, briefly, in a notification pane.
  document.body.innerHTML = `
    <div id="chat"><ol class="chat-log">
      <li class="chat-message" data-message-id="a"></li>
      <li class="chat-message" data-message-id="b"></li>
    </ol></div>
    <div id="chat-notifications"><li class="chat-message" data-message-id="b"></li></div>`;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("highlightMessages", () => {
  it("outlines every copy of the given messages, and removes it again", () => {
    expect(highlightMessages(document, ["b"], true)).toBe(2);
    expect(document.querySelectorAll(".fate-dice-linked")).toHaveLength(2);
    highlightMessages(document, ["b"], false);
    expect(document.querySelectorAll(".fate-dice-linked")).toHaveLength(0);
  });

  it("ignores ids that aren't on screen, and odd characters in ids", () => {
    expect(highlightMessages(document, ["zzz", 'x"]'], true)).toBe(0);
  });
});

describe("jumpToMessage", () => {
  it("scrolls the chat log's copy into view and flashes it briefly", () => {
    vi.useFakeTimers();
    const log = /** @type {HTMLElement} */ (document.querySelector("#chat"));
    const target = /** @type {HTMLElement} */ (log.querySelector('[data-message-id="b"]'));
    target.scrollIntoView = vi.fn();
    expect(jumpToMessage(document, "b", { container: log })).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target.classList.contains("fate-dice-flash")).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(target.classList.contains("fate-dice-flash")).toBe(false);
  });

  it("says when the message isn't on screen, so the caller can open it another way", () => {
    expect(jumpToMessage(document, "gone", {})).toBe(false);
  });
});
