import { test, expect } from '@playwright/test';

const routes = [
  { path: '/',        match: /observatory/i },
  { path: '/about',   match: /about/i },
  { path: '/archive', match: /archive/i },
  { path: '/data',    match: /data/i },
];

for (const r of routes) {
  test(`route ${r.path} renders`, async ({ page }) => {
    await page.goto(r.path);
    await expect(page.locator('main')).toContainText(r.match);
  });
}

test('route not found renders 404', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByText('404')).toBeVisible();
});
