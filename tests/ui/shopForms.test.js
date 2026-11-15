import { describe, expect, it } from "vitest";
import { itemFromForm, itemToForm, summarizeImport } from "../../scripts/ui/shopForms.js";

/** @returns {any} */
const item = (/** @type {Partial<any>} */ extra = {}) => ({
  id: "a",
  name: "Back on Your Feet",
  description: "Stand up.",
  cost: 2,
  kind: "purchase",
  costStep: 0,
  costStepPer: "campaign",
  limit: { count: 1, per: "session" },
  requiresNote: false,
  enabled: true,
  ...extra,
});

describe("itemToForm / itemFromForm", () => {
  it("round-trips an item through the edit form", () => {
    expect(itemFromForm(itemToForm(item()), "a")).toEqual({ ok: true, item: item() });
  });

  it("reads numbers and checkboxes the way a form submits them", () => {
    const result = itemFromForm(
      {
        name: " Lucky Find ",
        description: "",
        kind: "purchase",
        cost: "1",
        costStep: "",
        costStepPer: "campaign",
        limitCount: "",
        limitPer: "session",
        requiresNote: true,
        enabled: false,
      },
      "new",
    );
    expect(result).toEqual({
      ok: true,
      item: item({
        id: "new",
        name: "Lucky Find",
        description: "",
        cost: 1,
        costStep: 0,
        limit: { count: null, per: "session" },
        requiresNote: true,
        enabled: false,
      }),
    });
  });

  it("reports what's wrong instead of saving a bad item", () => {
    const result = itemFromForm({ ...itemToForm(item()), name: "", cost: "-3" }, "a");
    expect(result.ok).toBe(false);
    expect(/** @type {any} */ (result).errors.join(" ")).toMatch(/name.*cost|cost.*name/);
  });
});

describe("summarizeImport", () => {
  it("counts new items and items whose names already exist", () => {
    const existing = [item({ id: "1", name: "Back on Your Feet" })];
    const incoming = [
      item({ id: "9", name: "back on your feet" }),
      item({ id: "8", name: "Rope" }),
    ];
    expect(summarizeImport(existing, { items: incoming, warnings: ["w"] })).toEqual({
      total: 2,
      added: 1,
      duplicates: 1,
      hasSettings: false,
      warnings: ["w"],
    });
  });

  it("notes when the file carries rule settings", () => {
    expect(
      summarizeImport([], { items: [], settings: { maxPoints: 3 }, warnings: [] }).hasSettings,
    ).toBe(true);
  });
});
