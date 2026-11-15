import { describe, expect, it } from "vitest";
import { getSystemAdapter } from "../../scripts/systems/index.js";
import { dnd5eAdapter } from "../../scripts/systems/dnd5e.js";

describe("getSystemAdapter", () => {
  it("returns the dnd5e adapter", () => {
    expect(getSystemAdapter("dnd5e")).toBe(dnd5eAdapter);
  });

  it.each(["pf2e", "toString", ""])("returns null for an unsupported system (%s)", (id) => {
    expect(getSystemAdapter(id)).toBeNull();
  });
});
