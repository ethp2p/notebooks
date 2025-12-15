// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Base path for deployment (e.g., GitHub Pages subdirectory)
// Set ASTRO_BASE env var for production, defaults to '/' for local dev
const base = process.env.ASTRO_BASE || '/';

export default defineConfig({
  site: process.env.ASTRO_SITE || 'http://localhost:4321',
  base,
  integrations: [tailwind()],
  output: 'static',
  build: {
    assets: 'assets'
  },
  vite: {
    assetsInclude: ['**/*.html']
  }
});
