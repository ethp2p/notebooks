#!/usr/bin/env bun
import { build } from 'esbuild';
import path from 'node:path';

await build({
  entryPoints: [path.resolve(import.meta.dir, '..', 'src', 'sw.ts')],
  outfile: path.resolve(import.meta.dir, '..', 'public', 'sw.js'),
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  platform: 'browser',
  minify: true,
});
process.stdout.write('Built site/public/sw.js\n');
