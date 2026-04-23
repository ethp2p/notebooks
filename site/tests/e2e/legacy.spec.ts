import { test, expect } from '@playwright/test';

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const parts = yesterday.split('-');
const y = parts[0] ?? '2025';
const m = parts[1] ?? '01';
const d = parts[2] ?? '01';

test('/latest/:id redirects to workspace', async ({ page }) => {
  await page.goto('/latest/mempool-visibility', { waitUntil: 'load' });
  // Client-side redirect; wait for React Router to settle
  await page.waitForURL(/\/w\//, { timeout: 10_000 });
  expect(new URL(page.url()).pathname.startsWith('/w/')).toBe(true);
});

test('/YYYY/MM/DD redirects to workspace', async ({ page }) => {
  await page.goto(`/${y}/${m}/${d}`, { waitUntil: 'load' });
  await page.waitForURL(/\/w\//, { timeout: 10_000 });
  expect(new URL(page.url()).pathname.startsWith('/w/')).toBe(true);
});

test('/YYYY/MM/DD/:id redirects to workspace at that date', async ({ page }) => {
  await page.goto(`/${y}/${m}/${d}/blob-inclusion`, { waitUntil: 'load' });
  await page.waitForURL(/\/w\//, { timeout: 10_000 });
  expect(new URL(page.url()).pathname.startsWith('/w/')).toBe(true);
});
