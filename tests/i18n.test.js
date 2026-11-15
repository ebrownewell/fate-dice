import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS } from "../scripts/core/settings.js";
import { ERROR_CODES } from "../scripts/core/errors.js";
import { CHAT_LABEL_KEYS } from "../scripts/foundry/chatHooks.js";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

/** @param {string} path */
const lookup = (path) => path.split(".").reduce((node, key) => node?.[key], en);

describe("English translations", () => {
  it.each(Object.entries(SETTING_DEFINITIONS))("has a name and hint for setting %s", (_k, def) => {
    expect(lookup(def.name)).toEqual(expect.any(String));
    expect(lookup(def.hint)).toEqual(expect.any(String));
  });

  it.each(Object.values(CHAT_LABEL_KEYS))("has chat label %s", (key) => {
    expect(lookup(key)).toEqual(expect.any(String));
  });

  it.each(ERROR_CODES)("has a message for error code %s", (code) => {
    expect(lookup(`FATEDICE.Errors.${code}`)).toEqual(expect.any(String));
  });
});
