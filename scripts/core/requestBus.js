// @ts-check
// Routes requests to the active GM's client, which is the single authority
// for every point change. The GM handles its own requests locally; players'
// requests travel over the module socket and come back as responses.
//
// Note: Foundry relays module socket data as-is, so the requester's userId is
// self-reported. That is fine for a home game; it is not tamper-proof.

import { FateError } from "./errors.js";

/**
 * @typedef {object} SocketLike
 * @property {(channel: string, data: unknown) => void} emit
 * @property {(channel: string, fn: (data: any) => void) => void} on
 */

/** @typedef {(payload: any, context: { userId: string }) => Promise<unknown>} Handler */

/**
 * @param {object} deps
 * @param {SocketLike} deps.socket game.socket
 * @param {string} deps.channel
 * @param {() => string} deps.getUserId
 * @param {() => string | null | undefined} deps.getActiveGMId
 * @param {Record<string, Handler>} deps.handlers
 * @param {number} [deps.timeoutMs]
 * @param {() => string} [deps.newId]
 * @param {{ error: (...args: unknown[]) => void }} [deps.logger]
 */
export function createRequestBus({
  socket,
  channel,
  getUserId,
  getActiveGMId,
  handlers,
  timeoutMs = 10_000,
  newId = () => crypto.randomUUID(),
  logger = console,
}) {
  /** @type {Map<string, { resolve: (v: unknown) => void, reject: (e: unknown) => void, timer: ReturnType<typeof setTimeout> }>} */
  const pending = new Map();

  /** Expected errors pass through; anything else becomes a generic "internal". */
  const toFateError = (/** @type {unknown} */ err) => {
    if (err instanceof FateError) return err;
    logger.error("fate-dice | Unexpected error handling request", err);
    return new FateError("internal", "Something went wrong. The GM's console has details.");
  };

  /** @param {unknown} action @param {unknown} payload @param {string} userId */
  const handle = async (action, payload, userId) => {
    if (typeof action !== "string" || !Object.hasOwn(handlers, action)) {
      throw new FateError("unknown-action", `Unknown action: ${String(action)}`);
    }
    return handlers[action](payload, { userId });
  };

  socket.on(channel, async (message) => {
    if (!message || typeof message !== "object") return;

    if (message.type === "request") {
      if (getActiveGMId() !== getUserId()) return;
      const base = { type: "response", id: message.id, requesterId: message.userId };
      try {
        const result = await handle(message.action, message.payload, message.userId);
        socket.emit(channel, { ...base, ok: true, result });
      } catch (err) {
        const { code, message: text } = toFateError(err);
        socket.emit(channel, { ...base, ok: false, error: { code, message: text } });
      }
      return;
    }

    if (message.type === "response" && message.requesterId === getUserId()) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new FateError(message.error?.code ?? "internal", message.error?.message));
    }
  });

  return {
    /**
     * Ask the active GM to perform an action.
     * @param {string} action
     * @param {unknown} payload
     * @returns {Promise<any>}
     */
    async request(action, payload) {
      const userId = getUserId();
      const gmId = getActiveGMId();
      if (!gmId) throw new FateError("no-gm", "A GM must be connected to do that");

      if (gmId === userId) {
        try {
          return await handle(action, payload, userId);
        } catch (err) {
          throw toFateError(err);
        }
      }

      return new Promise((resolve, reject) => {
        const id = newId();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new FateError("timeout", "The GM didn't respond in time"));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        socket.emit(channel, { type: "request", id, action, payload, userId });
      });
    },
  };
}
