import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateStage1Gate,
  evaluateStage2Gate,
  evaluateStage3Gate,
  evaluateStage4Gate,
} from './gates.ts';

test('stage 1 requires a ready product with an anchor image', () => {
  const blocked = evaluateStage1Gate({
    products: [{ id: 'p1', selected: true, preparationStatus: 'failed', hasAnchorImage: false }],
  });
  assert.equal(blocked.passed, false);
  assert.ok(blocked.blockers.some((item) => item.code === 'NO_READY_PRODUCT'));

  const passed = evaluateStage1Gate({
    products: [{
      id: 'p1',
      selected: true,
      preparationStatus: 'ready',
      hasAnchorImage: true,
      categoryId: 'jewelry',
    }],
  });
  assert.equal(passed.passed, true);
});

test('stage 1 mixed categories require acknowledgement', () => {
  const blocked = evaluateStage1Gate({
    products: [
      { id: 'p1', selected: true, preparationStatus: 'ready', hasAnchorImage: true, categoryId: 'jewelry' },
      { id: 'p2', selected: true, preparationStatus: 'ready', hasAnchorImage: true, categoryId: 'apparel' },
    ],
  });
  assert.equal(blocked.passed, false);
  assert.ok(blocked.blockers.some((item) => item.code === 'MIXED_CATEGORY'));

  const passed = evaluateStage1Gate({
    products: [
      { id: 'p1', selected: true, preparationStatus: 'ready', hasAnchorImage: true, categoryId: 'jewelry' },
      { id: 'p2', selected: true, preparationStatus: 'ready', hasAnchorImage: true, categoryId: 'apparel' },
    ],
    mixedCategoryAcknowledged: true,
  });
  assert.equal(passed.passed, true);
});

test('stage 2 requires images, architecture, published locks and confirmation', () => {
  const blocked = evaluateStage2Gate({
    products: [{ id: 'p1', selected: true, selectedImageCount: 0, hasCompatibleArchitecture: false }],
    lockedAssets: [{ assetId: 'scene-1', published: false, conflicts: ['场景与类目冲突'] }],
    estimatedTaskCount: 0,
    planConfirmed: false,
  });
  const codes = blocked.blockers.map((item) => item.code);
  assert.ok(codes.includes('NO_PRODUCT_IMAGE'));
  assert.ok(codes.includes('NO_ARCHITECTURE'));
  assert.ok(codes.includes('LOCKED_ASSET_UNPUBLISHED'));
  assert.ok(codes.includes('ASSET_CONFLICT'));
  assert.ok(codes.includes('TASK_COUNT_UNKNOWN'));
  assert.ok(codes.includes('PLAN_UNCONFIRMED'));
});

test('stage 3 blocks missing storyboards and unapproved reviews', () => {
  const blocked = evaluateStage3Gate({
    products: [{
      id: 'p1',
      selected: true,
      hasStructuredStoryboard: false,
      blockingIssues: 2,
      warningsConfirmed: false,
    }],
    storyboardApproved: false,
  });
  const codes = blocked.blockers.map((item) => item.code);
  assert.ok(codes.includes('MISSING_STORYBOARD'));
  assert.ok(codes.includes('BLOCKING_QUALITY'));
  assert.ok(codes.includes('WARNINGS_UNCONFIRMED'));
  assert.ok(codes.includes('STORYBOARD_UNAPPROVED'));
});

test('stage 4 requires accepted outputs, terminal tasks and explicit completion', () => {
  const blocked = evaluateStage4Gate({
    products: [{ id: 'p1', selected: true, skipped: false, acceptedCount: 0, reviewDecisions: ['unreviewed'] }],
    tasks: [{ id: 't1', terminal: false, recoveryRequired: true }],
    copywritingReady: false,
    userCompleted: false,
  });
  const codes = blocked.blockers.map((item) => item.code);
  assert.ok(codes.includes('TASKS_RUNNING'));
  assert.ok(codes.includes('RECOVERY_REQUIRED'));
  assert.ok(codes.includes('NO_ACCEPTED_OUTPUT'));
  assert.ok(codes.includes('COPYWRITING_PENDING'));
  assert.ok(codes.includes('USER_COMPLETE_REQUIRED'));

  const passed = evaluateStage4Gate({
    products: [{ id: 'p1', selected: true, skipped: false, acceptedCount: 1, reviewDecisions: ['accepted'] }],
    tasks: [{ id: 't1', terminal: true }],
    copywritingReady: true,
    userCompleted: true,
  });
  assert.equal(passed.passed, true);
});
