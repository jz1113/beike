import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COVER_FORMATS, parseCoverFormat } from './coverFormat.ts';

test('maps the requested third-column values to exact output formats', () => {
  assert.equal(parseCoverFormat('文字竖'), COVER_FORMATS.portrait);
  assert.equal(parseCoverFormat('文字横'), COVER_FORMATS.square);
  assert.deepEqual(
    [parseCoverFormat('文字竖'), parseCoverFormat('文字横')].map((format) => [format.width, format.height, format.aspectRatio]),
    [[720, 960, '3:4'], [1440, 1440, '1:1']],
  );
});

test('keeps historic two-column imports portrait and rejects a populated typo', () => {
  assert.equal(parseCoverFormat(''), COVER_FORMATS.portrait);
  assert.equal(parseCoverFormat('720 × 960'), COVER_FORMATS.portrait);
  assert.equal(parseCoverFormat('正方形'), COVER_FORMATS.square);
  assert.equal(parseCoverFormat('1440 × 1440'), COVER_FORMATS.square);
  assert.equal(parseCoverFormat('横向长图'), undefined);
});
