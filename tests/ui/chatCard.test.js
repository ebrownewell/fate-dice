// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addFateBanner, addFateControls, describeFateDie } from "../../scripts/ui/chatCard.js";

const LABELS = {
  reroll: "Fate Reroll",
  fated: "Fated",
  banner: "Fate Reroll",
  kept: "kept",
  notKept: "not kept",
  reasons: { "insufficient-points": "Not enough Fate Dice." },
  was: "was {total}",
  original: "original",
  viewOriginal: "Show the original roll",
  viewFated: "Show the Fate Reroll",
};

/** A chat message element shaped like Foundry's. */
function messageElement() {
  const li = document.createElement("li");
  li.className = "chat-message";
  li.innerHTML = `<header class="message-header"></header><div class="message-content"><div class="dice-roll"></div></div>`;
  return li;
}

/** @type {HTMLElement} */
let root;
beforeEach(() => {
  root = messageElement();
});

describe("describeFateDie", () => {
  it("shows the bonus when one applied", () => {
    expect(describeFateDie({ natural: 7, bonus: 10, value: 17 })).toBe("7 → 17 (+10)");
  });

  it("shows just the number when no bonus applied", () => {
    expect(describeFateDie({ natural: 12, bonus: 0, value: 12 })).toBe("12");
  });
});

describe("addFateControls", () => {
  it("adds an enabled button showing the cost", () => {
    addFateControls(root, { visible: true, enabled: true }, { cost: 1, labels: LABELS });
    const button = /** @type {HTMLButtonElement} */ (root.querySelector("button.fate-dice-reroll"));
    expect(button.textContent?.trim()).toBe("Fate Reroll (1)");
    expect(button.disabled).toBe(false);
    // Next to the message content, not inside it: dnd5e 6 re-renders the content after
    // Foundry's render hook, which would wipe anything added inside.
    const controls = root.querySelector(".fate-dice-controls");
    expect(controls?.parentElement).toBe(root);
    expect(controls?.previousElementSibling?.classList.contains("message-content")).toBe(true);
  });

  it("adds a disabled button explaining why", () => {
    addFateControls(
      root,
      { visible: true, enabled: false, reason: "insufficient-points" },
      { cost: 1, labels: LABELS },
    );
    const button = /** @type {HTMLButtonElement} */ (root.querySelector("button.fate-dice-reroll"));
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Not enough Fate Dice.");
  });

  it("shows a marker on a roll that was already fated", () => {
    addFateControls(root, { visible: false, fated: true }, { cost: 1, labels: LABELS });
    expect(root.querySelector(".fate-dice-fated")?.textContent).toBe("Fated");
    expect(root.querySelector("button")).toBeNull();
  });

  it("makes the Fated marker a link to the fated roll when given onJump", () => {
    const onJump = vi.fn();
    addFateControls(root, { visible: false, fated: true }, { cost: 1, labels: LABELS, onJump });
    const marker = /** @type {HTMLElement} */ (root.querySelector(".fate-dice-fated"));
    expect(marker.tagName).toBe("A");
    expect(marker.title).toBe("Show the Fate Reroll");
    marker.click();
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it("adds nothing when the button is hidden", () => {
    addFateControls(root, { visible: false }, { cost: 1, labels: LABELS });
    expect(root.querySelector(".fate-dice-controls")).toBeNull();
  });

  it("never adds a second set of controls on re-render", () => {
    const state = /** @type {const} */ ({ visible: true, enabled: true });
    addFateControls(root, state, { cost: 1, labels: LABELS });
    addFateControls(root, state, { cost: 1, labels: LABELS });
    expect(root.querySelectorAll(".fate-dice-controls")).toHaveLength(1);
  });

  it("calls onClick once and disables the button while the request runs", async () => {
    /** @type {(v?: unknown) => void} */
    let finish = () => {};
    const onClick = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    addFateControls(root, { visible: true, enabled: true }, { cost: 1, labels: LABELS, onClick });
    const button = /** @type {HTMLButtonElement} */ (root.querySelector("button.fate-dice-reroll"));

    button.click();
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    finish();
  });

  it("re-enables the button if the request fails", async () => {
    const onClick = vi.fn(async () => {
      throw new Error("nope");
    });
    addFateControls(root, { visible: true, enabled: true }, { cost: 1, labels: LABELS, onClick });
    const button = /** @type {HTMLButtonElement} */ (root.querySelector("button.fate-dice-reroll"));
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
  });
});

describe("addFateBanner", () => {
  const outcome = {
    fate: { natural: 7, bonus: 10, value: 17 },
    against: { natural: 1, value: 1 },
    kept: /** @type {const} */ ("fate"),
    result: { natural: 7, bonus: 10, value: 17 },
    isCritical: false,
    isFumble: false,
  };

  it("puts a banner just above the message content, outside it", () => {
    addFateBanner(root, outcome, LABELS);
    const banner = root.querySelector(".fate-dice-banner");
    expect(banner?.parentElement).toBe(root);
    expect(banner?.nextElementSibling?.classList.contains("message-content")).toBe(true);
  });

  it("survives the message content being re-rendered", () => {
    addFateBanner(root, outcome, LABELS);
    addFateControls(root, { visible: true, enabled: true }, { cost: 1, labels: LABELS });
    const content = /** @type {HTMLElement} */ (root.querySelector(".message-content"));
    content.innerHTML = "<div>re-rendered by the system</div>";
    expect(root.querySelector(".fate-dice-banner")).not.toBeNull();
    expect(root.querySelector(".fate-dice-controls")).not.toBeNull();
  });

  it("goes inside a card that has no message content (e.g. one attack row)", () => {
    const row = document.createElement("div");
    row.className = "chat-attack";
    addFateControls(row, { visible: true, enabled: true }, { cost: 1, labels: LABELS });
    expect(row.querySelector(".fate-dice-controls")?.parentElement).toBe(row);
  });

  it("says what the fate die rolled and whether it was kept", () => {
    addFateBanner(root, outcome, LABELS);
    expect(root.querySelector(".fate-dice-banner")?.textContent).toBe(
      "Fate Reroll: 7 → 17 (+10), kept",
    ); // no original total or link given
    addFateBanner(root, { ...outcome, kept: "original" }, LABELS);
    expect(root.querySelector(".fate-dice-banner")?.textContent).toBe(
      "Fate Reroll: 7 → 17 (+10), not kept",
    );
  });

  it("shows what the original roll was, so pairs are easy to match", () => {
    addFateBanner(root, outcome, LABELS, { originalTotal: 9 });
    expect(root.querySelector(".fate-dice-banner")?.textContent).toContain(
      "Fate Reroll: 7 → 17 (+10), kept · was 9",
    );
  });

  it("links back to the original when given onJump", () => {
    const onJump = vi.fn();
    addFateBanner(root, outcome, LABELS, { onJump });
    const link = /** @type {HTMLElement} */ (
      root.querySelector(".fate-dice-banner .fate-dice-jump")
    );
    expect(link.title).toBe("Show the original roll");
    expect(link.textContent).toContain("original");
    link.click();
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it("never adds a second banner on re-render", () => {
    addFateBanner(root, outcome, LABELS);
    addFateBanner(root, outcome, LABELS);
    expect(root.querySelectorAll(".fate-dice-banner")).toHaveLength(1);
  });

  it("escapes nothing it shouldn't: labels are set as text, not HTML", () => {
    addFateBanner(root, outcome, { ...LABELS, banner: "<b>Fate</b>" });
    expect(root.querySelector(".fate-dice-banner b")).toBeNull();
  });
});
