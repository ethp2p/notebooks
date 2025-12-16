// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Base path for deployment (e.g., GitHub Pages subdirectory)
// Set ASTRO_BASE env var for production, defaults to '/' for local dev
const base = process.env.ASTRO_BASE || '/';

export default defineConfig({
  site: process.env.ASTRO_SITE || 'http://localhost:4321',
  base,
  integrations: [react()],
  output: 'static',
  build: {
    assets: 'assets'
  },
  vite: {
    assetsInclude: ['**/*.html'],
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  }
});
