import { describe, expect, it } from "vitest";
import { buildPurchaseMessage, escapeHtml } from "../../scripts/ui/purchaseMessage.js";

const labels = {
  spent: "{actor} spent {amount} Fate Dice on {item}",
  flaw: "{actor} took a flaw, gaining {amount} Fate Dice: {item}",
};

describe("escapeHtml", () => {
  it("escapes characters that are special in HTML", () => {
    expect(escapeHtml(`<b a="1">'&'</b>`)).toBe(
      "&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;",
    );
  });
});

describe("buildPurchaseMessage", () => {
  const base = {
    actorName: "Ann",
    itemName: "Back on Your Feet",
    description: "Stand up.",
    note: "",
    cost: 2,
    gain: 0,
    labels,
  };

  it("says who spent how much on what, with the description", () => {
    const html = buildPurchaseMessage(base);
    expect(html).toContain("Ann spent 2 Fate Dice on <strong>Back on Your Feet</strong>");
    expect(html).toContain('<p class="fate-dice-purchase-description">Stand up.</p>');
  });

  it("describes a flaw as a gain", () => {
    expect(buildPurchaseMessage({ ...base, cost: 0, gain: 1, itemName: "Greedy" })).toContain(
      "Ann took a flaw, gaining 1 Fate Dice: <strong>Greedy</strong>",
    );
  });

  it("includes the player's note", () => {
    expect(buildPurchaseMessage({ ...base, note: "Grabbed the rope" })).toContain(
      "<blockquote>Grabbed the rope</blockquote>",
    );
  });

  it("escapes everything players or shop files control", () => {
    const html = buildPurchaseMessage({
      ...base,
      actorName: "<img onerror=x>",
      itemName: "<script>",
      description: "<i>",
      note: "<a href=x>",
    });
    expect(html).not.toMatch(/<img|<script|<i>|<a /);
  });

  it("keeps line breaks in descriptions", () => {
    expect(buildPurchaseMessage({ ...base, description: "One\nTwo" })).toContain("One<br>Two");
  });
});
