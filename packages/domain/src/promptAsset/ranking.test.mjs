import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyUsageCounts } from './scoring.ts';
import { heuristicRank, rankPromptAssets, weightedRank } from './ranking.ts';

test('low sample uses heuristic ranking', () => {
  const ranked = rankPromptAssets([{
    id: 'a',
    categoryScore: 100,
    qualityScore: 10,
    counts: emptyUsageCounts(),
    diversityScore: 10,
    favoriteScore: 0,
  }]);
  assert.equal(ranked[0].strategy, 'heuristic');
});

test('weighted ranking includes explainable reasons', () => {
  const counts = emptyUsageCounts();
  counts.submitted = 20;
  counts.succeeded = 18;
  counts.accepted = 15;
  const ranked = weightedRank({
    id: 'b',
    categoryScore: 90,
    qualityScore: 80,
    counts,
    diversityScore: 50,
    favoriteScore: 40,
  });
  assert.equal(ranked.strategy, 'weighted');
  assert.equal(ranked.reasons.length, 5);
});

test('heuristic mentions sample fallback', () => {
  const ranked = heuristicRank({
    id: 'c',
    categoryScore: 50,
    qualityScore: null,
    counts: emptyUsageCounts(),
    diversityScore: 20,
    favoriteScore: 10,
  });
  assert.match(ranked.reasons.join(''), /样本不足/);
});
