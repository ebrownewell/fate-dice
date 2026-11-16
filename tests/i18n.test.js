import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIENT_SETTING_DEFINITIONS, SETTING_DEFINITIONS } from "../scripts/core/settings.js";
import { ERROR_CODES } from "../scripts/core/errors.js";
import { CHAT_LABEL_KEYS } from "../scripts/foundry/chatHooks.js";
import { PF1_ATTACK_LABEL_KEYS } from "../scripts/foundry/fateRerollDeps.js";
import { LOG_LABEL_KEYS } from "../scripts/ui/logRows.js";
import { LOG_APP_KEYS, NOMINATION_KEYS, PANEL_KEYS, SHOP_KEYS } from "../scripts/apps/labels.js";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

/** @param {string} path */
const lookup = (path) => path.split(".").reduce((node, key) => node?.[key], en);

describe("English translations", () => {
  it.each(Object.entries(SETTING_DEFINITIONS))("has a name and hint for setting %s", (_k, def) => {
    expect(lookup(def.name)).toEqual(expect.any(String));
    expect(lookup(def.hint)).toEqual(expect.any(String));
  });

  it("has a name and hint for each client setting shown in the menu", () => {
    for (const def of /** @type {any[]} */ (Object.values(CLIENT_SETTING_DEFINITIONS))) {
      if (!def.config) continue;
      expect(lookup(/** @type {string} */ (def.name))).toEqual(expect.any(String));
      expect(lookup(/** @type {string} */ (def.hint))).toEqual(expect.any(String));
    }
  });

  it.each([...Object.values(CHAT_LABEL_KEYS), ...Object.values(PF1_ATTACK_LABEL_KEYS)])(
    "has chat label %s",
    (key) => {
      expect(lookup(key)).toEqual(expect.any(String));
    },
  );

  it.each([...LOG_LABEL_KEYS, ...LOG_APP_KEYS, ...PANEL_KEYS, ...SHOP_KEYS, ...NOMINATION_KEYS])(
    "has label %s",
    (key) => {
      expect(lookup(key)).toEqual(expect.any(String));
    },
  );

  it.each(ERROR_CODES)("has a message for error code %s", (code) => {
    expect(lookup(`FATEDICE.Errors.${code}`)).toEqual(expect.any(String));
  });
});
