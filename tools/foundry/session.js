// @ts-check
// Drive a local dev Foundry server with Playwright. Used by tools that record
// test fixtures and run in-Foundry checks. Not part of the shipped module.

import { chromium } from "playwright";

export const FOUNDRY_URL = process.env.FOUNDRY_URL ?? "http://localhost:30001";

/**
 * The GM account automation uses, so it never competes with a person logged
 * in as the world's own Gamemaster. Created by setup-world.js.
 */
export const TEST_GM = "Test GM";

/**
 * Open a browser, join the running world as the named user, and wait until
 * Foundry has finished loading.
 * Tests don't need the game canvas, so it's off by default: rendering it in
 * software made several headless browsers starve each other.
 * @param {{ user?: string, password?: string, headless?: boolean, canvas?: boolean }} [options]
 */
export async function joinWorld({
  user = TEST_GM,
  password = "",
  headless = true,
  canvas = false,
} = {}) {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  if (!canvas) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("core.noCanvas", "true");
      } catch {
        // Storage unavailable: the canvas just stays on.
      }
    });
  }
  page.on("pageerror", (err) => console.error("[page error]", err.message));

  try {
    await page.goto(`${FOUNDRY_URL}/join`);
    await page.selectOption('select[name="userid"]', { label: user }, { timeout: 10_000 });
    await page.fill('input[name="password"]', password);
    await Promise.all([page.waitForURL(/\/game$/), page.click('button[name="join"]')]);
    await waitForReady(page);
  } catch (err) {
    // Close the browser, or it keeps the Node process alive forever.
    await browser.close();
    throw new Error(`Could not join as "${user}" (already logged in elsewhere?)`, { cause: err });
  }
  return { browser, page };
}

/** @param {import("playwright").Page} page */
export async function waitForReady(page) {
  await page.waitForFunction(() => typeof game !== "undefined" && game?.ready === true, null, {
    timeout: 60_000,
  });
}
