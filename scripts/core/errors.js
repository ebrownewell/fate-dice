// @ts-check

/** Every error code the module reports. Each has a message in lang/en.json. */
export const ERROR_CODES = /** @type {const} */ ([
  "invalid",
  "insufficient-points",
  "not-permitted",
  "not-found",
  "not-fateable",
  "no-gm",
  "timeout",
  "unknown-action",
  "internal",
]);

/** @typedef {typeof ERROR_CODES[number]} ErrorCode */

/** An expected failure that can be shown to the user, identified by a code. */
export class FateError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {string} [message]
   */
  constructor(code, message = code) {
    super(message);
    this.name = "FateError";
    this.code = code;
  }
}
