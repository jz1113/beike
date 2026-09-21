import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESERVED_ART_DIRECTIONS, reservedArtDirectionFor, sourceKey } from './reservedArtDirections.ts';

test('assigns a different reserved art direction to every repeated source image', () => {
  const source = 'https://cdn.example.com/product.jpg#preview';
  const assigned = Array.from({ length: RESERVED_ART_DIRECTIONS.length }, (_, occurrence) =>
    reservedArtDirectionFor(source, occurrence).id,
  );
  assert.equal(new Set(assigned).size, RESERVED_ART_DIRECTIONS.length);
  assert.equal(sourceKey(source), 'https://cdn.example.com/product.jpg');
});

test('each reservation differs in both named visual treatment and colour language', () => {
  assert.equal(new Set(RESERVED_ART_DIRECTIONS.map((item) => item.label)).size, RESERVED_ART_DIRECTIONS.length);
  assert.equal(new Set(RESERVED_ART_DIRECTIONS.map((item) => item.description)).size, RESERVED_ART_DIRECTIONS.length);
});
