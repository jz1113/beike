#!/usr/bin/env node
/** Generate feed previews without changing the original inspiration files or URLs. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const mediaRoot = path.join(root, 'src/client/public/inspirations');
const targetRoot = path.join(mediaRoot, 'thumbnails');
const names = ['gen_meituan_fish', 'gen_royal_cat', 'gen_soup_lily', 'gen_taro_plant', 'gen_ribs_soup'];
fs.mkdirSync(targetRoot, { recursive: true });
let originals = 0;
let previews = 0;
for (const name of names) {
  const source = path.join(mediaRoot, `${name}.png`);
  const target = path.join(targetRoot, `${name}.jpg`);
  execFileSync(ffmpeg.path, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-vf', 'scale=768:-2', '-frames:v', '1', '-q:v', '3', target,
  ], { stdio: 'inherit' });
  originals += fs.statSync(source).size;
  previews += fs.statSync(target).size;
}
console.log(`[inspiration] ${names.length} feed previews: ${(previews / 1024).toFixed(1)} KiB; originals ${(originals / 1048576).toFixed(1)} MiB retained.`);
