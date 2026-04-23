import { test, expect } from '@playwright/test';

test('sample chart renders a canvas', async ({ page }) => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/__gallery__/chart?id=region-winner-grouped-bar&date=${yesterday}`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 5_000 });
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(50);
  expect(box?.height).toBeGreaterThan(50);
});
