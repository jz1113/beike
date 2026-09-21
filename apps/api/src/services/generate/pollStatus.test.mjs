import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideDirectImagePoll, decideProbeMissPoll } from './pollStatus.ts';

test('direct_ tasks only succeed when a result URL exists', () => {
  const success = decideDirectImagePoll('direct_1', { resultUrl: 'https://cdn.example/a.jpg' }, false);
  assert.equal(success.body.status, 'SUCCESS');
  assert.equal(success.httpStatus, 200);

  const missingUrl = decideDirectImagePoll('direct_1', { status: 'SUCCESS' }, false);
  assert.equal(missingUrl.body.status, 'FAILURE');
  assert.equal(missingUrl.body.failReason, '同步任务未返回结果图');

  const dbError = decideDirectImagePoll('direct_1', null, true);
  assert.equal(dbError.httpStatus, 503);
  assert.equal(dbError.body.success, false);
});

test('probe miss never reports fake IN_PROGRESS progress', () => {
  const unknown = decideProbeMissPoll('task_1', { status: 'IN_PROGRESS' }, false);
  assert.equal(unknown.body.status, 'QUERY_FAILED');
  assert.notEqual(unknown.body.progress, '25%');
  assert.notEqual(unknown.body.status, 'IN_PROGRESS');

  const fromDb = decideProbeMissPoll('task_1', { resultUrl: 'https://cdn.example/a.jpg' }, false);
  assert.equal(fromDb.body.status, 'SUCCESS');

  const failed = decideProbeMissPoll('task_1', { status: 'FAILURE', failReason: '上游拒绝' }, false);
  assert.equal(failed.body.status, 'FAILURE');
  assert.equal(failed.body.failReason, '上游拒绝');
});

test('video probe miss uses video copy and still avoids fake IN_PROGRESS', () => {
  const unknown = decideProbeMissPoll('vid_1', { status: 'IN_PROGRESS' }, false, 'video');
  assert.equal(unknown.body.status, 'QUERY_FAILED');
  assert.equal(unknown.body.error, '暂时无法查询云端视频任务状态');

  const failed = decideProbeMissPoll('vid_1', { status: 'FAILURE' }, false, 'video');
  assert.equal(failed.body.status, 'FAILURE');
  assert.equal(failed.body.failReason, '视频任务失败');
});
