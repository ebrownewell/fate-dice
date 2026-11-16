import { describe, expect, it } from "vitest";
import { getSystemAdapter } from "../../scripts/systems/index.js";
import { dnd5eAdapter } from "../../scripts/systems/dnd5e.js";
import { pf1Adapter } from "../../scripts/systems/pf1.js";
import { pf2eAdapter } from "../../scripts/systems/pf2e.js";

describe("getSystemAdapter", () => {
  it("returns the dnd5e adapter", () => {
    expect(getSystemAdapter("dnd5e")).toBe(dnd5eAdapter);
  });

  it("returns the pf2e and pf1 adapters", () => {
    expect(getSystemAdapter("pf2e")).toBe(pf2eAdapter);
    expect(getSystemAdapter("pf1")).toBe(pf1Adapter);
  });

  it.each(["sfrpg", "toString", ""])("returns null for an unsupported system (%s)", (id) => {
    expect(getSystemAdapter(id)).toBeNull();
  });
});
