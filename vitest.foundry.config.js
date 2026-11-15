import { defineConfig } from "vitest/config";

// Browser tests against the local dev Foundry server (see tools/foundry).
// They need a running, licensed server, so CI does not run them.
export default defineConfig({
  test: {
    include: ["tests-foundry/**/*.test.js"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Freshly joined browsers are slow for a few seconds; give syncs time.
    expect: { poll: { timeout: 10_000 } },
  },
});
