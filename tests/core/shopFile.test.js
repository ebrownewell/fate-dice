import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportShop, mergeShops, parseShopFile, SHOP_FORMAT } from "../../scripts/core/shopFile.js";

let ids = 0;
const newId = () => `id${++ids}`;

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

const SETTINGS = {
  maxPoints: 3,
  rerollEnabled: true,
  rerollCost: 1,
  bonusEnabled: true,
  bonusThreshold: 9,
  bonusAmount: 10,
  rerollOnInitiative: true,
  rerollOnDeathSaves: false,
};

describe("exportShop", () => {
  it("writes the format, version, name and items", () => {
    const file = exportShop({ name: "My table", items: [item()] });
    expect(file).toEqual({ format: SHOP_FORMAT, version: 1, name: "My table", items: [item()] });
  });

  it("includes the rule settings when asked", () => {
    expect(exportShop({ name: "x", items: [], settings: SETTINGS }).settings).toEqual(SETTINGS);
  });

  it("round-trips through parseShopFile", () => {
    const file = exportShop({ name: "x", items: [item()], settings: SETTINGS });
    const parsed = /** @type {any} */ (parseShopFile(JSON.stringify(file), newId));
    expect(parsed).toMatchObject({ ok: true, name: "x", items: [item()], settings: SETTINGS });
  });
});

describe("parseShopFile", () => {
  /** @param {any} data */
  const parse = (data) =>
    /** @type {any} */ (
      parseShopFile(typeof data === "string" ? data : JSON.stringify(data), newId)
    );
  const valid = { format: SHOP_FORMAT, version: 1, name: "x", items: [item()] };

  it("rejects text that isn't JSON", () => {
    expect(parse("{nope")).toMatchObject({ ok: false, errors: [expect.stringContaining("JSON")] });
  });

  it("rejects a file that isn't a Fate Dice shop", () => {
    expect(parse({ ...valid, format: "other" })).toMatchObject({ ok: false });
  });

  it("rejects a file from a newer version of the module", () => {
    expect(parse({ ...valid, version: 2 })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("newer")],
    });
  });

  it("rejects a file without an item list", () => {
    expect(parse({ ...valid, items: "lots" })).toMatchObject({ ok: false });
  });

  it("skips invalid items with a warning, keeping the valid ones", () => {
    const result = parse({ ...valid, items: [item(), item({ name: "", id: "b" })] });
    expect(result).toMatchObject({ ok: true, items: [item()] });
    expect(result.warnings).toEqual([expect.stringContaining("item 2")]);
  });

  it("fills in missing optional item fields", () => {
    const result = parse({ ...valid, items: [{ name: "Lucky Find", cost: 1 }] });
    expect(result.items?.[0]).toMatchObject({
      name: "Lucky Find",
      kind: "purchase",
      enabled: true,
    });
  });

  it("gives items with duplicate ids new ids", () => {
    const result = parse({ ...valid, items: [item(), item({ name: "Other" })] });
    const [first, second] = result.items ?? [];
    expect(first.id).not.toBe(second.id);
  });

  it("keeps only known, valid settings, warning about the rest", () => {
    const result = parse({
      ...valid,
      settings: { ...SETTINGS, bonusThreshold: 40, hackTheGibson: true },
    });
    expect(result.settings).not.toHaveProperty("bonusThreshold");
    expect(result.settings).not.toHaveProperty("hackTheGibson");
    expect(result.settings).toMatchObject({ maxPoints: 3, rerollCost: 1 });
    expect(result.warnings).toHaveLength(2);
  });

  it("accepts a text setting only when it's one of the allowed choices", () => {
    const good = parse({ ...valid, settings: { nominationMode: "vote" } });
    expect(good.settings).toEqual({ nominationMode: "vote" });
    const bad = parse({ ...valid, settings: { nominationMode: "anarchy" } });
    expect(bad.settings).toEqual({});
    expect(bad.warnings).toHaveLength(1);
  });

  it("treats descriptions as plain text: HTML survives only as literal text", () => {
    const result = parse({
      ...valid,
      items: [item({ description: '<img src=x onerror="alert(1)">' })],
    });
    expect(result.items?.[0].description).toBe('<img src=x onerror="alert(1)">');
  });

  it("refuses absurdly large files", () => {
    const huge = { ...valid, items: Array.from({ length: 501 }, (_, i) => item({ id: `i${i}` })) };
    expect(parse(huge)).toMatchObject({ ok: false, errors: [expect.stringContaining("500")] });
  });
});

describe("the example shop shipped with the module", () => {
  it("is a valid shop file", () => {
    const text = readFileSync(new URL("../../examples/default-shop.json", import.meta.url), "utf8");
    const result = /** @type {any} */ (parseShopFile(text, newId));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.items?.length).toBeGreaterThan(2);
  });
});

describe("mergeShops", () => {
  const existing = [
    item({ id: "1", name: "Back on Your Feet", cost: 2 }),
    item({ id: "2", name: "Lucky Find" }),
  ];

  it("replace: uses only the imported items", () => {
    const incoming = [item({ id: "9", name: "New" })];
    expect(mergeShops(existing, incoming, "replace")).toEqual(incoming);
  });

  it("merge-update: updates items with the same name (keeping their id) and adds new ones", () => {
    const incoming = [
      item({ id: "9", name: "back on your feet", cost: 5 }),
      item({ id: "8", name: "New" }),
    ];
    expect(mergeShops(existing, incoming, "update")).toEqual([
      item({ id: "1", name: "back on your feet", cost: 5 }),
      existing[1],
      item({ id: "8", name: "New" }),
    ]);
  });

  it("merge-keep: keeps existing items with the same name and adds new ones", () => {
    const incoming = [
      item({ id: "9", name: "Back on Your Feet", cost: 5 }),
      item({ id: "8", name: "New" }),
    ];
    expect(mergeShops(existing, incoming, "keep")).toEqual([
      ...existing,
      item({ id: "8", name: "New" }),
    ]);
  });

  it("never ends up with two items sharing an id", () => {
    const incoming = [item({ id: "2", name: "Different" })];
    const merged = mergeShops(existing, incoming, "keep");
    expect(new Set(merged.map((i) => i.id)).size).toBe(merged.length);
  });
});
