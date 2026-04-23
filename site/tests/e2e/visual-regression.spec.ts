import { test, expect } from '@playwright/test';
import registry from '../../public/registry.json' with { type: 'json' };

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const ids = Object.keys((registry as { charts: Record<string, unknown> }).charts);

test.skip(!process.env['VISUAL_REGRESSION'], 'Requires live data; run locally with VISUAL_REGRESSION=1');

for (const id of ids) {
  test(`visual ${id}`, async ({ page }) => {
    await page.goto(`/__gallery__/chart?id=${id}&date=${yesterday}`);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(canvas).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.005 });
  });
}
