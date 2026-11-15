// In-memory stand-ins for the small slice of Foundry the core logic touches.

/**
 * @param {string} id
 * @param {boolean} [isGM]
 * @returns {import("../../scripts/core/types.js").UserLike}
 */
export const fakeUser = (id, isGM = false) => ({ id, isGM });

/**
 * A fake actor whose flags live in memory. setFlag yields to the event loop
 * first, like a real database write, so races show up in tests.
 * @param {string} id
 * @param {{ owners?: string[], flags?: Record<string, Record<string, unknown>> }} [options]
 */
export function fakeActor(id, { owners = [], flags = {} } = {}) {
  /** @type {Record<string, Record<string, unknown>>} */
  const store = structuredClone(flags);
  return {
    id,
    setFlagCalls: 0,
    /** @param {string} scope @param {string} key */
    getFlag(scope, key) {
      return store[scope]?.[key];
    },
    /** @param {string} scope @param {string} key @param {unknown} value */
    async setFlag(scope, key, value) {
      this.setFlagCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
      (store[scope] ??= {})[key] = value;
      return this;
    },
    updateCalls: 0,
    /**
     * Apply a Foundry-style update with dotted keys, e.g. { "flags.x.points": 2 }.
     * @param {Record<string, unknown>} changes
     */
    async update(changes) {
      this.updateCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const [path, value] of Object.entries(changes)) {
        const [root, scope, key] = path.split(".");
        if (root !== "flags" || !scope || !key) throw new Error(`fake update can't set ${path}`);
        (store[scope] ??= {})[key] = structuredClone(value);
      }
      return this;
    },
    /** @param {{ id: string }} user @param {string} level */
    testUserPermission(user, level) {
      return level === "OWNER" && owners.includes(user.id);
    },
  };
}

/**
 * A socket hub that mimics Foundry's game.socket: emit() reaches every other
 * connected client asynchronously, never the sender.
 */
export function createFakeSocketHub() {
  /** @type {{ userId: string, listeners: Map<string, Function[]> }[]} */
  const clients = [];
  /** @type {{ from: string, channel: string, data: any }[]} */
  const sent = [];

  return {
    sent,
    /** @param {string} userId */
    client(userId) {
      const self = { userId, listeners: new Map() };
      clients.push(self);
      return {
        /** @param {string} channel @param {Function} fn */
        on(channel, fn) {
          self.listeners.set(channel, [...(self.listeners.get(channel) ?? []), fn]);
        },
        /** @param {string} channel @param {any} data */
        emit(channel, data) {
          sent.push({ from: userId, channel, data });
          const copy = structuredClone(data);
          for (const other of clients) {
            if (other === self) continue;
            for (const fn of other.listeners.get(channel) ?? []) {
              Promise.resolve().then(() => fn(structuredClone(copy)));
            }
          }
        },
      };
    },
  };
}

/** Let queued promise callbacks and zero-delay timers run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
