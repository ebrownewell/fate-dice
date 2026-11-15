import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../scripts/core/templates.js";

describe("TEMPLATES", () => {
  it("preloads every template in templates/, so no window waits on its first open", () => {
    const files = readdirSync(new URL("../templates/", import.meta.url))
      .filter((f) => f.endsWith(".hbs"))
      .map((f) => `modules/fate-dice/templates/${f}`)
      .sort();
    expect([...TEMPLATES].sort()).toEqual(files);
  });
});
