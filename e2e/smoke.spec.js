/**
 * @file e2e/smoke.spec.js
 * @copyright © 2025 Aswin. All rights reserved.
 * @author Aswin
 * @description End-to-end (Playwright) smoke tests for the dashboard.
 */
import { test, expect } from '@playwright/test';

// Block third-party analytics/chat scripts so the tests measure the app itself,
// not flaky external requests.
test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com|chatwoot|widget/i, (r) =>
    r.abort()
  );
});

test('app mounts and renders real content', async ({ page }) => {
  const resp = await page.goto('/');
  expect(resp?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/TTNN Eltwise Performance/i);

  // Deterministic proof React actually rendered: #root gains child elements
  // (a blank/failed mount leaves the static <div id="root"></div> empty).
  const root = page.locator('#root');
  await expect(root).toBeVisible();
  await expect
    .poll(async () => (await root.locator(':scope > *').count()), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // A real, user-visible heading is present (not just an empty shell).
  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('no uncaught exceptions from the app on load', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // Wait for the app to actually render rather than a fixed timeout.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 15_000 });
  expect(pageErrors, 'uncaught exceptions on load').toEqual([]);
});
