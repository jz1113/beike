#!/usr/bin/env node
/** Batch compress public/inspirations/*.jpg for Hub feed (max width 1200, quality 80). */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = join(root, 'public/inspirations');
const MAX_WIDTH = 1200;
const QUALITY = 80;

const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f));
let totalBefore = 0;
let totalAfter = 0;

for (const f of files) {
  const path = join(dir, f);
  const before = (await import('node:fs')).statSync(path).size;
  totalBefore += before;

  const buf = await sharp(path)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();

  await sharp(buf).toFile(path);
  const after = buf.length;
  totalAfter += after;
  console.log(`${f}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
}

console.log(
  `done ${files.length} files: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB`,
);
