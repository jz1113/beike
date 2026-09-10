import { describe, expect, it } from 'vitest';
import { safeErrorMessage, normalizeJsonError } from '../validate';

describe('safeErrorMessage', () => {
  it('透传已知无害错误前缀', () => {
    expect(safeErrorMessage(new Error('ENOENT: no such file'))).toBe('ENOENT: no such file');
    expect(safeErrorMessage(new Error('缺少 taskId 参数'))).toBe('缺少 taskId 参数');
    expect(safeErrorMessage(new Error('网络连接超时'))).toBe('网络连接超时');
  });

  it('过滤包含 SQL/SQLite/Prisma 的内部错误', () => {
    expect(safeErrorMessage(new Error('sqlite error: database locked'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('prisma query error at user.ts:42'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('sql syntax error near SELECT'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('at Object.<anonymous> (/Users/.../index.ts)'))).toBe('服务器内部错误');
  });

  it('过滤文件路径泄露', () => {
    expect(safeErrorMessage(new Error('ENOENT: /Users/huayuzulin/Downloads/foo.png'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('Cannot find module /home/user/node_modules/foo'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('C:\\Users\\Admin\\secrets.json'))).toBe('服务器内部错误');
  });

  it('过滤 JSON 解析错误中的路径信息', () => {
    expect(safeErrorMessage(new Error('Unexpected token at position 42'))).toBe('服务器内部错误');
    expect(safeErrorMessage(new Error('parse error at line 3 column 10'))).toBe('服务器内部错误');
  });

  it('安全已知无害错误返回原始消息', () => {
    expect(safeErrorMessage(new Error('任务已过期，请重新提交'))).toBe('任务已过期，请重新提交');
    expect(safeErrorMessage(new Error('未配置万邦 API Key'))).toBe('未配置万邦 API Key');
  });

  it('超长错误消息被截断至 200 字符', () => {
    const long = 'a'.repeat(500);
    const result = safeErrorMessage(new Error(long));
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('非 Error 类型 fallback', () => {
    expect(safeErrorMessage('some string error')).toBe('some string error');
    expect(safeErrorMessage(null, 'fallback')).toBe('fallback');
    expect(safeErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(safeErrorMessage(123, 'fallback')).toBe('fallback');
  });
});

describe('normalizeJsonError', () => {
  it('Zod JSON 格式错误归一化', () => {
    expect(normalizeJsonError(new Error('[zod] at body.key'))).toBe('请求数据格式异常');
    expect(normalizeJsonError(new Error('Unexpected token in JSON at position 10'))).toBe('请求数据格式异常');
  });

  it('普通错误透传', () => {
    expect(normalizeJsonError(new Error('缺少 taskId 参数'))).toBe('缺少 taskId 参数');
  });

  it('空消息 fallback', () => {
    expect(normalizeJsonError(new Error(''))).toBe('请求数据格式异常');
    expect(normalizeJsonError(null)).toBe('请求数据格式异常');
  });
});
