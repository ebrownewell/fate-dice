import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestBus } from "../../scripts/core/requestBus.js";
import { FateError } from "../../scripts/core/errors.js";
import { createFakeSocketHub, flush } from "../helpers/fakes.js";

const CHANNEL = "module.fate-dice";
const silentLogger = { error: vi.fn() };

/**
 * Connect a set of clients to one hub. Each gets its own bus and handler spies.
 * @param {string[]} userIds
 * @param {{ activeGM?: string | null, handlers?: Record<string, Function>, timeoutMs?: number }} [options]
 */
function connect(userIds, { activeGM = "gm", handlers, timeoutMs } = {}) {
  const hub = createFakeSocketHub();
  let counter = 0;
  /** @type {Record<string, { bus: ReturnType<typeof createRequestBus>, handlers: Record<string, any> }>} */
  const clients = {};
  for (const userId of userIds) {
    const clientHandlers = handlers ?? {
      echo: vi.fn(async (payload, context) => ({ payload, context, handledBy: userId })),
    };
    clients[userId] = {
      handlers: clientHandlers,
      bus: createRequestBus({
        socket: hub.client(userId),
        channel: CHANNEL,
        getUserId: () => userId,
        getActiveGMId: () => activeGM,
        // @ts-expect-error handler spies are loosely typed
        handlers: clientHandlers,
        timeoutMs,
        newId: () => `${userId}-${++counter}`,
        logger: silentLogger,
      }),
    };
  }
  return { hub, clients };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRequestBus", () => {
  it("runs the handler locally when the requester is the active GM", async () => {
    const { hub, clients } = connect(["gm"]);
    const result = await clients.gm.bus.request("echo", { n: 1 });
    expect(result).toEqual({ payload: { n: 1 }, context: { userId: "gm" }, handledBy: "gm" });
    expect(hub.sent).toEqual([]);
  });

  it("sends a player's request to the active GM and returns the GM's result", async () => {
    const { clients } = connect(["gm", "alice"]);
    const result = await clients.alice.bus.request("echo", { n: 2 });
    expect(result).toEqual({ payload: { n: 2 }, context: { userId: "alice" }, handledBy: "gm" });
    expect(clients.alice.handlers.echo).not.toHaveBeenCalled();
  });

  it("only the active GM handles a request", async () => {
    const { clients } = connect(["gm", "gm2", "alice", "bob"]);
    await clients.alice.bus.request("echo", {});
    expect(clients.gm.handlers.echo).toHaveBeenCalledTimes(1);
    expect(clients.gm2.handlers.echo).not.toHaveBeenCalled();
    expect(clients.bob.handlers.echo).not.toHaveBeenCalled();
  });

  it("routes each response back to the player who asked", async () => {
    const { clients } = connect(["gm", "alice", "bob"]);
    const [a, b] = await Promise.all([
      clients.alice.bus.request("echo", { who: "a" }),
      clients.bob.bus.request("echo", { who: "b" }),
    ]);
    expect(a.payload).toEqual({ who: "a" });
    expect(b.payload).toEqual({ who: "b" });
  });

  it("passes a FateError from the GM back to the player with its code", async () => {
    const { clients } = connect(["gm", "alice"], {
      handlers: {
        fail: async () => {
          throw new FateError("insufficient-points", "Not enough Fate Dice");
        },
      },
    });
    const error = await clients.alice.bus.request("fail", {}).catch((e) => e);
    expect(error).toBeInstanceOf(FateError);
    expect(error).toMatchObject({ code: "insufficient-points", message: "Not enough Fate Dice" });
  });

  it("reports unexpected handler errors as 'internal' without leaking details", async () => {
    const { clients } = connect(["gm", "alice"], {
      handlers: {
        crash: async () => {
          throw new TypeError("secret stack detail");
        },
      },
    });
    const error = await clients.alice.bus.request("crash", {}).catch((e) => e);
    expect(error).toMatchObject({ code: "internal" });
    expect(error.message).not.toContain("secret");
  });

  it("also wraps unexpected errors when the GM handles a request locally", async () => {
    const { clients } = connect(["gm"], {
      handlers: {
        crash: async () => {
          throw new TypeError("boom");
        },
      },
    });
    await expect(clients.gm.bus.request("crash", {})).rejects.toMatchObject({ code: "internal" });
  });

  it("rejects an unknown action", async () => {
    const { clients } = connect(["gm", "alice"]);
    await expect(clients.alice.bus.request("hack", {})).rejects.toMatchObject({
      code: "unknown-action",
    });
  });

  it("does not treat inherited object properties as actions", async () => {
    const { clients } = connect(["gm", "alice"]);
    await expect(clients.alice.bus.request("toString", {})).rejects.toMatchObject({
      code: "unknown-action",
    });
  });

  it("fails straight away when no GM is connected", async () => {
    const { hub, clients } = connect(["alice"], { activeGM: null });
    await expect(clients.alice.bus.request("echo", {})).rejects.toMatchObject({ code: "no-gm" });
    expect(hub.sent).toEqual([]);
  });

  it("times out if the GM never answers", async () => {
    vi.useFakeTimers();
    // "gm" is active but never connected, so nobody answers.
    const { clients } = connect(["alice"], { timeoutMs: 1000 });
    const pending = clients.alice.bus.request("echo", {});
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("ignores malformed messages and responses it did not ask for", async () => {
    const { hub, clients } = connect(["gm", "alice"]);
    const rogue = hub.client("mallory");
    rogue.emit(CHANNEL, null);
    rogue.emit(CHANNEL, "nonsense");
    rogue.emit(CHANNEL, { type: "response", id: "nope", requesterId: "alice", ok: true });
    await flush();
    await expect(clients.alice.bus.request("echo", { still: "works" })).resolves.toMatchObject({
      payload: { still: "works" },
    });
  });
});
