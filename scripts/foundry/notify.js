// @ts-check
import { FateError } from "../core/errors.js";

/**
 * Show a request failure to the user, in their language.
 * @param {unknown} err
 */
export function notifyError(err) {
  const code =
    err instanceof FateError || /** @type {any} */ (err)?.code
      ? /** @type {any} */ (err).code
      : "internal";
  const key = `FATEDICE.Errors.${code}`;
  const text = game.i18n.has(key)
    ? game.i18n.localize(key)
    : String(/** @type {any} */ (err)?.message ?? err);
  ui.notifications.warn(text);
}
