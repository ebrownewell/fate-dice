// @ts-check

/**
 * Runs async tasks one at a time per key, so two changes to the same actor
 * can never interleave. Different keys run in parallel.
 */
export function createKeyedQueue() {
  /** @type {Map<string, Promise<unknown>>} */
  const tails = new Map();

  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    run(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task, task);
      const tail = result.catch(() => {});
      tails.set(key, tail);
      tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
  };
}
