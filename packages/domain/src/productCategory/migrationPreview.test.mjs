import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryMigrationPreview } from './migrationPreview.ts';

test('merges local custom categories with defaults', () => {
  const preview = buildCategoryMigrationPreview([
    {
      parentId: 'jewelry',
      categories: [
        { id: 'necklace', parentId: 'jewelry', label: '项链/锁骨链', shortLabel: '项链', keywords: ['项链'] },
        { id: 'custom_locket', parentId: 'jewelry', label: '香囊吊坠', shortLabel: '香囊', keywords: ['香囊'], isCustom: true },
      ],
    },
  ]);
  assert.ok(preview.items.some((item) => item.label.includes('项链')));
  assert.ok(preview.items.some((item) => item.id === 'custom_locket' && item.source === 'local'));
});
