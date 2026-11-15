import { describe, expect, it } from "vitest";
import { createKeyedQueue } from "../../scripts/core/keyedQueue.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createKeyedQueue", () => {
  it("returns the task's result", async () => {
    const queue = createKeyedQueue();
    await expect(queue.run("a", async () => 42)).resolves.toBe(42);
  });

  it("runs tasks with the same key one after another", async () => {
    const queue = createKeyedQueue();
    /** @type {string[]} */
    const log = [];
    /** @param {string} name */
    const task = (name) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
    };
    await Promise.all([queue.run("a", task("one")), queue.run("a", task("two"))]);
    expect(log).toEqual(["one start", "one end", "two start", "two end"]);
  });

  it("runs tasks with different keys in parallel", async () => {
    const queue = createKeyedQueue();
    /** @type {string[]} */
    const log = [];
    /** @param {string} name */
    const task = (name) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
    };
    await Promise.all([queue.run("a", task("one")), queue.run("b", task("two"))]);
    expect(log).toEqual(["one start", "two start", "one end", "two end"]);
  });

  it("keeps going after a task fails", async () => {
    const queue = createKeyedQueue();
    const failing = queue.run("a", async () => {
      throw new Error("boom");
    });
    const next = queue.run("a", async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
