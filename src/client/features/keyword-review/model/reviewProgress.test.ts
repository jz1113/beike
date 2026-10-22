import { describe, expect, it } from 'vitest';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import { advanceAutomaticRetryVersions, countReviewRecords, isAutomaticRetryRecord, isIsolatedSubmission, isUnbilledGatewayFailure } from './reviewProgress';

function record(id: string, patch: Partial<KeywordReviewRecord>): KeywordReviewRecord {
  return { id, query: id, sheetName: 'Sheet1', rowNumber: 1, status: 'idle', sourceValues: {}, ...patch };
}

describe('automatic keyword review retries', () => {
  it('resumes ordinary failures and unbilled gateway rows, not unknown charges', () => {
    const gateway = record('gateway', {
      status: 'error',
      submissionUncertain: true,
      error: '模型网关请求失败，请稍后重试；提交结果待核对，暂不重新收费',
    });
    const busy = record('busy', {
      status: 'error',
      submissionUncertain: true,
      error: '模型网关服务繁忙，请稍后重试。接口原因：超时',
    });
    const deepseek = record('deepseek', {
      status: 'error',
      submissionUncertain: true,
      error: 'DeepSeek 服务暂时故障，请稍后重试；提交结果待核对，暂不重新收费',
    });
    const ordinary = record('ordinary', { status: 'error', error: '模型结果无法修复' });
    const dropped = record('dropped', {
      status: 'error',
      submissionUncertain: true,
      error: '审核服务连接中断；本批提交结果待核对，不会以新任务重复收费',
    });
    const timeout = record('timeout', {
      status: 'error',
      submissionUncertain: true,
      error: '模型响应超时，已生成内容已保留。请稍后继续，或检查上游服务的超时设置。',
    });
    const receipt = record('receipt', {
      status: 'error',
      submissionUncertain: true,
      error: '该任务正在提交或提交结果待核对，请查询原任务，不要重复提交',
    });
    const truncated = record('truncated', {
      status: 'error',
      submissionUncertain: true,
      error: '模型服务响应传输异常，提交结果待核对；提交结果待核对，暂不重新收费',
    });
    expect(isUnbilledGatewayFailure(gateway)).toBe(true);
    expect(isUnbilledGatewayFailure(busy)).toBe(true);
    expect(isUnbilledGatewayFailure(deepseek)).toBe(true);
    expect(isAutomaticRetryRecord(ordinary)).toBe(true);
    for (const held of [dropped, timeout, receipt, truncated]) {
      expect(isUnbilledGatewayFailure(held)).toBe(false);
      expect(isAutomaticRetryRecord(held)).toBe(false);
    }
    expect(isAutomaticRetryRecord(record('idle', { status: 'idle' }))).toBe(false);

    const versions = new Map<number, number>([[1, 3]]);
    const indices = new Map([['gateway', 1], ['dropped', 2], ['ordinary', 3]]);
    advanceAutomaticRetryVersions([gateway, dropped, ordinary, record('idle', { status: 'idle' })], indices, versions);
    expect(versions.get(1)).toBe(4);
    expect(versions.get(3)).toBe(1);
    expect(versions.has(2)).toBe(false);
    expect(isIsolatedSubmission(dropped)).toBe(true);
    expect(isIsolatedSubmission(gateway)).toBe(false);
    const counts = countReviewRecords([gateway, dropped, ordinary]);
    expect(counts.failed).toBe(3);
    expect(counts.uncertain).toBe(1);
  });
});
