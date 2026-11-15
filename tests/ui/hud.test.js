// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { clampPosition, hudModel, renderHud } from "../../scripts/ui/hud.js";

describe("hudModel", () => {
  it("shows a player their character's Fate Dice as filled and empty dots", () => {
    expect(
      hudModel({ isGM: false, character: { name: "Ann" }, points: 2, max: 3, show: true }),
    ).toEqual({
      visible: true,
      mode: "player",
      name: "Ann",
      points: 2,
      max: 3,
      dots: [true, true, false],
    });
  });

  it("shows extra dots if a character holds more than the maximum", () => {
    const model = /** @type {any} */ (
      hudModel({ isGM: false, character: { name: "Ann" }, points: 4, max: 3, show: true })
    );
    expect(model.dots).toEqual([true, true, true, true]);
  });

  it("is hidden for a player with no assigned character", () => {
    expect(hudModel({ isGM: false, character: null, points: 0, max: 3, show: true }).visible).toBe(
      false,
    );
  });

  it("is hidden when the player turned it off", () => {
    expect(
      hudModel({ isGM: false, character: { name: "Ann" }, points: 1, max: 3, show: false }).visible,
    ).toBe(false);
  });

  it("is a GM panel launcher for the GM", () => {
    expect(hudModel({ isGM: true, character: null, points: 0, max: 3, show: true })).toEqual({
      visible: true,
      mode: "gm",
    });
  });
});

describe("renderHud", () => {
  const labels = { title: "Fate Dice", gmButton: "Fate Dice", openLog: "Open your Fate Dice log" };

  it("draws the dots and the count", () => {
    const root = document.createElement("div");
    renderHud(
      root,
      { visible: true, mode: "player", name: "Ann", points: 2, max: 3, dots: [true, true, false] },
      { labels },
    );
    expect(root.querySelectorAll(".fate-dice-dot")).toHaveLength(3);
    expect(root.querySelectorAll(".fate-dice-dot.filled")).toHaveLength(2);
    expect(root.querySelector(".fate-dice-hud-count")?.textContent).toBe("2 / 3");
    expect(root.hidden).toBe(false);
  });

  it("hides itself when not visible", () => {
    const root = document.createElement("div");
    renderHud(root, { visible: false }, { labels });
    expect(root.hidden).toBe(true);
  });

  it("calls onOpen when clicked, but not after a drag", () => {
    const root = document.createElement("div");
    const onOpen = vi.fn();
    const model = /** @type {const} */ ({ visible: true, mode: "gm" });
    renderHud(root, model, { labels, onOpen });
    root.querySelector("button")?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);

    root.dataset.dragged = "true";
    root.querySelector("button")?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(root.dataset.dragged).toBeUndefined();
  });

  it("replaces its contents on re-render", () => {
    const root = document.createElement("div");
    const model = /** @type {const} */ ({ visible: true, mode: "gm" });
    renderHud(root, model, { labels });
    renderHud(root, model, { labels });
    expect(root.querySelectorAll("button")).toHaveLength(1);
  });
});

describe("clampPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 100, height: 40 };

  it("keeps a position that fits", () => {
    expect(clampPosition({ left: 50, top: 60 }, size, viewport)).toEqual({ left: 50, top: 60 });
  });

  it("pulls the HUD back on screen", () => {
    expect(clampPosition({ left: -20, top: 900 }, size, viewport)).toEqual({ left: 0, top: 760 });
    expect(clampPosition({ left: 990, top: -5 }, size, viewport)).toEqual({ left: 900, top: 0 });
  });

  it("returns null for a missing or invalid saved position", () => {
    expect(clampPosition(null, size, viewport)).toBeNull();
    expect(clampPosition(/** @type {any} */ ({ left: "x", top: 1 }), size, viewport)).toBeNull();
  });
});
