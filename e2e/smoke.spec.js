import { test, expect } from '@playwright/test';

test('home page loads and renders the app', async ({ page }) => {
  const resp = await page.goto('/');
  expect(resp?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/TTNN Eltwise Performance/i);
  // App actually mounted something visible (not a blank white page).
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.locator('#root, #app, main, body > *').first()).toBeVisible();
});

test('no uncaught page errors on load', async ({ page }) => {
  // Track only real JS exceptions (pageerror). We avoid asserting on
  // console.error and avoid networkidle (analytics can keep the socket open),
  // which would make the test flaky.
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500); // let deferred scripts run
  expect(pageErrors, 'uncaught exceptions on load').toEqual([]);
});
