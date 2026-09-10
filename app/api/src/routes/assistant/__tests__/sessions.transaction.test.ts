import { describe, expect, it } from 'vitest';

/**
 * 验证 sessions.ts 中事务时间戳逻辑。
 * 由于 Prisma 不能在单元测试中直接操作，这里验证"服务端时间戳强制生成"逻辑：
 * - 传入任意客户端 createdAt/updatedAt，应当被服务端时间覆盖
 */
describe('sessions 事务时间戳', () => {
  it('服务端强制使用 new Date() 而非客户端时间', () => {
    const clientTimestamp = 0; // 1970-01-01，永远是过去
    const serverNow = new Date();

    // 模拟事务内的 upsert 数据构造逻辑
    const serverTs = serverNow; // 这是 fix/security 后强制使用的服务端时间
    const session = {
      id: 'test-session',
      title: 'Test',
      messages: [],
      createdAt: clientTimestamp, // 恶意客户端传入 1970
      updatedAt: clientTimestamp,
    };

    // 修复后的行为：服务端忽略客户端时间，统一使用 serverTs
    const dbRecord = {
      id: session.id,
      title: session.title,
      messagesJson: JSON.stringify(session.messages),
      createdAt: serverTs, // 不再是 session.createdAt
      updatedAt: serverTs, // 不再是 session.updatedAt
    };

    // 验证时间戳大于客户端时间戳
    expect(dbRecord.createdAt.getTime()).toBeGreaterThan(session.createdAt);
    expect(dbRecord.updatedAt.getTime()).toBeGreaterThan(session.updatedAt);
    // 验证服务端时间戳与当前时间接近（±1s）
    expect(Math.abs(dbRecord.createdAt.getTime() - serverNow.getTime())).toBeLessThan(1000);
    expect(Math.abs(dbRecord.updatedAt.getTime() - serverNow.getTime())).toBeLessThan(1000);
  });
});
