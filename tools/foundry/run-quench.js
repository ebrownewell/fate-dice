// @ts-check
// Run the module's Quench integration tests in the dev world and report the
// results in the terminal. Exits non-zero if any test fails.
//   node tools/foundry/run-quench.js            # all fate-dice batches
//   node tools/foundry/run-quench.js "fate-dice.points"

import { joinWorld } from "./session.js";

const pattern = process.argv[2] ?? "fate-dice.**";
const { browser, page } = await joinWorld();

/** @type {any} */
const report = await page.evaluate(async (batches) => {
  const done = new Promise((resolve) =>
    Hooks.once("quenchReports", (/** @type {any} */ { json }) => resolve(json)),
  );
  // Quench's reporter writes into its results window, so it must be open.
  await quench.app.render(true);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await quench.runBatches(batches);
  const json = await done;
  return typeof json === "string" ? JSON.parse(json) : json;
}, pattern);

await browser.close();

for (const test of report.passes ?? []) console.log(`  ✓ ${test.fullTitle}`);
for (const test of report.pending ?? []) console.log(`  - ${test.fullTitle} (skipped)`);
for (const test of report.failures ?? []) {
  console.log(`  ✗ ${test.fullTitle}\n      ${test.err?.message ?? "unknown error"}`);
}
const { tests = 0, passes = 0, failures = 0, pending = 0 } = report.stats ?? {};
console.log(`\n${passes}/${tests} passed, ${failures} failed, ${pending} skipped`);
if (tests === 0) console.log("No tests ran. Is the module enabled and the batch name right?");
process.exit(failures > 0 || tests === 0 ? 1 : 0);
