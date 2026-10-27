import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSPIRATION_ITEMS } from '../../../src/client/features/home/data/inspirationData';

const publicRoot = path.resolve(import.meta.dirname, '../../../src/client/public');
const paths = [...new Set(INSPIRATION_ITEMS.flatMap(item => [item.image, item.video, item.poster, item.thumbnail, ...(item.referenceImages || [])]).filter((url): url is string => Boolean(url)))];

describe('home inspiration catalogue', () => {
  it('retains all 47 current images and 9 videos with unique identifiers after removing retired cases', () => {
    expect(INSPIRATION_ITEMS.filter(item => item.mediaType === 'video')).toHaveLength(9);
    expect(INSPIRATION_ITEMS.filter(item => item.mediaType !== 'video')).toHaveLength(47);
    expect(new Set(INSPIRATION_ITEMS.map(item => item.id)).size).toBe(INSPIRATION_ITEMS.length);
  });

  it.each(paths)('resolves a real, nonempty media asset at %s', url => {
    const file = path.join(publicRoot, url);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
    const header = Buffer.alloc(12);
    const fd = openSync(file, 'r');
    try { readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
    if (/\.png$/.test(url)) expect(header.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    else if (/\.jpe?g$/.test(url)) expect(header.subarray(0, 2).toString('hex')).toBe('ffd8');
    else if (/\.mp4$/.test(url)) expect(header.subarray(4, 8).toString()).toBe('ftyp');
    else throw new Error(`Unverified media format: ${url}`);
  });
});
