import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  STATE_SETTING_DEFINITIONS,
  getFateRules,
  readSettings,
  registerSettings,
} from "../../scripts/core/settings.js";
import { DEFAULT_FATE_RULES } from "../../scripts/rules/fateReroll.js";

const DEFAULTS = {
  maxPoints: 3,
  rerollEnabled: true,
  rerollCost: 1,
  bonusEnabled: true,
  bonusThreshold: 9,
  bonusAmount: 10,
  rerollOnInitiative: true,
  rerollOnDeathSaves: true,
  hidePf2eHeroPointReroll: true,
  nominationMode: "gm",
  nominationLimit: 1,
};

describe("SETTING_DEFINITIONS", () => {
  it("defines every setting with the agreed defaults", () => {
    const defaults = Object.fromEntries(
      Object.entries(SETTING_DEFINITIONS).map(([key, def]) => [key, def.default]),
    );
    expect(defaults).toEqual(DEFAULTS);
  });

  it("makes every setting a world setting the GM can see in the settings menu", () => {
    for (const def of Object.values(SETTING_DEFINITIONS)) {
      expect(def.scope).toBe("world");
      expect(def.config).toBe(true);
    }
  });

  it("marks system-specific settings with the systems they apply to", () => {
    expect(SETTING_DEFINITIONS.hidePf2eHeroPointReroll.systems).toEqual(["pf2e"]);
    expect(SETTING_DEFINITIONS.rerollOnDeathSaves.systems).toEqual(["dnd5e"]);
  });

  it("offers nominations off, by GM approval, or by party vote", () => {
    expect(Object.keys(SETTING_DEFINITIONS.nominationMode.choices)).toEqual(["off", "gm", "vote"]);
  });

  it("limits the bonus threshold to 1–19", () => {
    expect(SETTING_DEFINITIONS.bonusThreshold.range).toEqual({ min: 1, max: 19, step: 1 });
  });
});

describe("CLIENT_SETTING_DEFINITIONS", () => {
  it("lets each player show or hide their HUD, on by default", () => {
    expect(CLIENT_SETTING_DEFINITIONS.showHud).toMatchObject({
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
    });
  });

  it("remembers the HUD position per client, out of the settings menu", () => {
    expect(CLIENT_SETTING_DEFINITIONS.hudPosition).toMatchObject({
      scope: "client",
      config: false,
      type: Object,
      default: null,
    });
  });
});

describe("STATE_SETTING_DEFINITIONS", () => {
  it("stores the session number and the shop as hidden world settings", () => {
    expect(STATE_SETTING_DEFINITIONS.session).toMatchObject({
      scope: "world",
      config: false,
      type: Number,
      default: 1,
    });
    expect(STATE_SETTING_DEFINITIONS.shop).toMatchObject({
      scope: "world",
      config: false,
      type: Object,
      default: { items: [] },
    });
  });
});

describe("registerSettings", () => {
  it("registers each definition under the module id", () => {
    const api = { register: vi.fn(), get: vi.fn() };
    registerSettings(api, "fate-dice");
    expect(api.register).toHaveBeenCalledTimes(
      Object.keys(SETTING_DEFINITIONS).length +
        Object.keys(CLIENT_SETTING_DEFINITIONS).length +
        Object.keys(STATE_SETTING_DEFINITIONS).length,
    );
    expect(api.register).toHaveBeenCalledWith(
      "fate-dice",
      "showHud",
      CLIENT_SETTING_DEFINITIONS.showHud,
    );
    expect(api.register).toHaveBeenCalledWith(
      "fate-dice",
      "maxPoints",
      SETTING_DEFINITIONS.maxPoints,
    );
  });
});

describe("registerSettings for a specific system", () => {
  const registered = (/** @type {string} */ systemId) => {
    const api = { register: vi.fn(), get: vi.fn() };
    registerSettings(api, "fate-dice", systemId);
    return Object.fromEntries(api.register.mock.calls.map(([, key, def]) => [key, def]));
  };

  it("shows a system-specific setting only in that system's settings menu", () => {
    expect(registered("pf2e").hidePf2eHeroPointReroll.config).toBe(true);
    expect(registered("dnd5e").hidePf2eHeroPointReroll.config).toBe(false);
    expect(registered("dnd5e").rerollOnDeathSaves.config).toBe(true);
    expect(registered("pf1").rerollOnDeathSaves.config).toBe(false);
  });

  it("still registers every setting, so reading one never fails", () => {
    expect(Object.keys(registered("pf1"))).toContain("hidePf2eHeroPointReroll");
  });

  it("does not pass the systems list on to Foundry", () => {
    expect(registered("pf2e").hidePf2eHeroPointReroll).not.toHaveProperty("systems");
  });
});

describe("readSettings", () => {
  it("reads every setting into a plain object", () => {
    const api = { register: vi.fn(), get: vi.fn((_ns, key) => `value of ${key}`) };
    const values = readSettings(api, "fate-dice");
    expect(Object.keys(values)).toEqual(Object.keys(SETTING_DEFINITIONS));
    expect(values.maxPoints).toBe("value of maxPoints");
    expect(api.get).toHaveBeenCalledWith("fate-dice", "maxPoints");
  });
});

describe("getFateRules", () => {
  it("maps the bonus settings to fate rules", () => {
    expect(getFateRules({ bonusEnabled: false, bonusThreshold: 5, bonusAmount: 5 })).toEqual({
      bonusEnabled: false,
      threshold: 5,
      bonus: 5,
    });
  });

  it("falls back to the default for any invalid value instead of breaking rerolls", () => {
    expect(getFateRules({ bonusEnabled: true, bonusThreshold: 25, bonusAmount: 15 })).toEqual({
      bonusEnabled: true,
      threshold: DEFAULT_FATE_RULES.threshold,
      bonus: 15,
    });
    expect(getFateRules({})).toEqual(DEFAULT_FATE_RULES);
  });
});
