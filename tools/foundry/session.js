// @ts-check
// Drive a local dev Foundry server with Playwright. Used by tools that record
// test fixtures and run in-Foundry checks. Not part of the shipped module.

import { chromium } from "playwright";

export const FOUNDRY_URL = process.env.FOUNDRY_URL ?? "http://localhost:30001";

/**
 * Open a browser, join the running world as the named user, and wait until
 * Foundry has finished loading.
 * @param {{ user?: string, password?: string, headless?: boolean }} [options]
 */
export async function joinWorld({ user = "Gamemaster", password = "", headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (err) => console.error("[page error]", err.message));

  await page.goto(`${FOUNDRY_URL}/join`);
  await page.selectOption('select[name="userid"]', { label: user });
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/game$/), page.click('button[name="join"]')]);
  await waitForReady(page);
  return { browser, page };
}

/** @param {import("playwright").Page} page */
export async function waitForReady(page) {
  await page.waitForFunction(() => typeof game !== "undefined" && game?.ready === true, null, {
    timeout: 60_000,
  });
}
