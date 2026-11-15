// @ts-check
import { DEFAULT_FATE_RULES, validateFateRules } from "../rules/fateReroll.js";

/** @typedef {import("../rules/fateReroll.js").FateRules} FateRules */

/**
 * @typedef {object} SettingsApi
 * @property {(namespace: string, key: string, data: object) => void} register
 * @property {(namespace: string, key: string) => unknown} get
 */

/** @param {string} key */
const i18n = (key) => ({
  name: `FATEDICE.Settings.${key}.Name`,
  hint: `FATEDICE.Settings.${key}.Hint`,
});

const world = /** @type {const} */ ({ scope: "world", config: true });

/** World settings, as passed to game.settings.register. */
export const SETTING_DEFINITIONS = {
  maxPoints: {
    ...i18n("MaxPoints"),
    ...world,
    type: Number,
    default: 3,
    range: { min: 1, max: 10, step: 1 },
  },
  rerollEnabled: { ...i18n("RerollEnabled"), ...world, type: Boolean, default: true },
  rerollCost: {
    ...i18n("RerollCost"),
    ...world,
    type: Number,
    default: 1,
    range: { min: 0, max: 10, step: 1 },
  },
  bonusEnabled: { ...i18n("BonusEnabled"), ...world, type: Boolean, default: true },
  bonusThreshold: {
    ...i18n("BonusThreshold"),
    ...world,
    type: Number,
    default: DEFAULT_FATE_RULES.threshold,
    range: { min: 1, max: 19, step: 1 },
  },
  bonusAmount: {
    ...i18n("BonusAmount"),
    ...world,
    type: Number,
    default: DEFAULT_FATE_RULES.bonus,
    range: { min: 1, max: 20, step: 1 },
  },
  rerollOnInitiative: { ...i18n("RerollOnInitiative"), ...world, type: Boolean, default: true },
  rerollOnDeathSaves: { ...i18n("RerollOnDeathSaves"), ...world, type: Boolean, default: true },
  nominationMode: {
    ...i18n("NominationMode"),
    ...world,
    type: String,
    default: "gm",
    choices: {
      off: "FATEDICE.Settings.NominationMode.Off",
      gm: "FATEDICE.Settings.NominationMode.Gm",
      vote: "FATEDICE.Settings.NominationMode.Vote",
    },
  },
  nominationLimit: {
    ...i18n("NominationLimit"),
    ...world,
    type: Number,
    default: 1,
    range: { min: 0, max: 10, step: 1 },
  },
};

/** Per-player settings. */
export const CLIENT_SETTING_DEFINITIONS = {
  showHud: {
    ...i18n("ShowHud"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  },
  hudPosition: {
    name: "HUD position",
    scope: "client",
    config: false,
    type: Object,
    default: null,
  },
};

/** World state kept in settings, hidden from the settings menu. */
export const STATE_SETTING_DEFINITIONS = {
  session: { name: "Session number", scope: "world", config: false, type: Number, default: 1 },
  shop: { name: "Shop", scope: "world", config: false, type: Object, default: { items: [] } },
};

/** @typedef {keyof typeof SETTING_DEFINITIONS} SettingKey */

/**
 * @param {SettingsApi} api game.settings
 * @param {string} moduleId
 */
export function registerSettings(api, moduleId) {
  for (const definitions of [
    SETTING_DEFINITIONS,
    CLIENT_SETTING_DEFINITIONS,
    STATE_SETTING_DEFINITIONS,
  ]) {
    for (const [key, definition] of Object.entries(definitions)) {
      api.register(moduleId, key, definition);
    }
  }
}

/**
 * @param {SettingsApi} api game.settings
 * @param {string} moduleId
 * @returns {Record<SettingKey, any>}
 */
export function readSettings(api, moduleId) {
  return /** @type {Record<SettingKey, any>} */ (
    Object.fromEntries(Object.keys(SETTING_DEFINITIONS).map((key) => [key, api.get(moduleId, key)]))
  );
}

/**
 * Build fate rules from setting values. Any invalid value falls back to its
 * default, so a bad setting can never break rerolls.
 * @param {{ bonusEnabled?: unknown, bonusThreshold?: unknown, bonusAmount?: unknown }} values
 * @returns {FateRules}
 */
export function getFateRules(values) {
  /** @type {any} */
  const candidate = {
    bonusEnabled: values.bonusEnabled,
    threshold: values.bonusThreshold,
    bonus: values.bonusAmount,
  };
  const rules = { ...DEFAULT_FATE_RULES };
  for (const key of /** @type {(keyof FateRules)[]} */ (Object.keys(rules))) {
    const trial = { ...DEFAULT_FATE_RULES, [key]: candidate[key] };
    if (validateFateRules(trial).length === 0) /** @type {any} */ (rules)[key] = candidate[key];
  }
  return rules;
}
