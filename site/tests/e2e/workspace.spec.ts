import { test, expect } from '@playwright/test';

test('home renders a flagship chart canvas', async ({ page }) => {
  await page.goto('/');
  // Wait for chart to mount; flagship chart fetches region_size_matrix fixture
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
});

test('sidebar toggle via keyboard', async ({ page }) => {
  await page.goto('/');
  // Sidebar starts open; Cmd+B toggles
  const sidebar = page.locator('aside').first();
  await expect(sidebar).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b');
  await expect(sidebar).not.toBeVisible();
});

test('split focused pane via keyboard', async ({ page }) => {
  await page.goto('/');
  // Wait for initial pane to mount
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Backslash' : 'Control+Backslash');
  // Two panes = potentially two canvases
  await expect(page.locator('canvas')).toHaveCount(2, { timeout: 5_000 });
});

test('close focused pane via keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+Backslash`);
  await expect(page.locator('canvas')).toHaveCount(2, { timeout: 5_000 });
  await page.keyboard.press(`${mod}+w`);
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 5_000 });
});

test('cmd-k opens the command palette', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  // shadcn Command renders inside a Dialog
  await expect(page.getByPlaceholder(/search charts/i)).toBeVisible({ timeout: 5_000 });
});

test('sidebar search narrows the chart list', async ({ page }) => {
  await page.goto('/');
  const search = page.getByPlaceholder(/search charts/i).first();
  await search.fill('mempool');
  // Any mempool chart should appear
  await expect(page.locator('button', { hasText: 'coverage' }).first()).toBeVisible({ timeout: 5_000 });
});
