// @ts-check
import { MODULE_ID } from "./constants.js";

/**
 * Every template the module renders. Preloaded at init: Foundry's first load
 * of an unloaded template takes seconds, which would delay opening windows.
 */
export const TEMPLATES = ["log", "gm-panel", "shop", "shop-editor"].map(
  (name) => `modules/${MODULE_ID}/templates/${name}.hbs`,
);
