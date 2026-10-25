#!/usr/bin/env node
/**
 * Ensures Vite emitted brand portraits (and key logos) into apps/web/dist.
 * Run after `pnpm --filter @talkdrop/web build`, or as a Docker build gate.
 *
 * Exit 0 when present; non-zero with a clear message otherwise.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const required = [
  'brand/portraits/mei.jpg',
  'brand/portraits/tomas.jpg',
  'brand/app-icon.png',
  'brand/logo-mark.svg',
];

const missing = [];
for (const rel of required) {
  const full = path.join(dist, rel);
  if (!existsSync(full)) {
    missing.push(rel);
    continue;
  }
  const size = statSync(full).size;
  if (size < 64) missing.push(`${rel} (too small: ${size} bytes)`);
  if (rel.endsWith('.jpg')) {
    const head = readFileSync(full).subarray(0, 3);
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
      missing.push(`${rel} (not a JPEG)`);
    }
  }
}

if (missing.length) {
  console.error('Brand assets missing from apps/web/dist (Vite publicDir copy failed):');
  for (const m of missing) console.error(`  - ${m}`);
  console.error('Expected sources under apps/web/public/brand/…');
  process.exit(1);
}

console.log('OK: brand portraits and logos present under apps/web/dist/brand/');
for (const rel of required) {
  const full = path.join(dist, rel);
  console.log(`  ${rel} (${statSync(full).size} bytes)`);
}
