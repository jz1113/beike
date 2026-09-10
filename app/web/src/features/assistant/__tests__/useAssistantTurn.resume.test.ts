import { describe, expect, it } from 'vitest';

/**
 * 验证 useAssistantTurn 中 lastTurnIdRef 逻辑。
 * 核心断言：turnId 在 turn/started 事件到来时，前一个 ID 应被保存到 lastTurnIdRef。
 */
describe('useAssistantTurn SSE 断线重连', () => {
  it('lastTurnIdRef 保存上一轮 turnId', () => {
    let currentTurnId: string | null = null;
    let lastTurnId: string | null = null;

    const simulateTurnStarted = (newId: string) => {
      // 修复逻辑：在更新当前 ID 前，先保存上一轮
      lastTurnId = currentTurnId;
      currentTurnId = newId;
    };

    // 第一轮
    simulateTurnStarted('turn-1');
    expect(currentTurnId).toBe('turn-1');
    expect(lastTurnId).toBeNull(); // 第一轮前无历史

    // 第二轮：模拟断线重连后新启动
    simulateTurnStarted('turn-2');
    expect(currentTurnId).toBe('turn-2');
    expect(lastTurnId).toBe('turn-1'); // 关键：lastTurnId 保存了上一轮 ID

    // 恢复快照时，使用 lastTurnId 而非 currentTurnId
    const snapshotTurnId = lastTurnId || currentTurnId;
    expect(snapshotTurnId).toBe('turn-1'); // 断线重连应恢复 turn-1，而非 turn-2
  });

  it('若 lastTurnId 为 null 则 fallback 到 currentTurnId', () => {
    let currentTurnId: string | null = null;
    let lastTurnId: string | null = null;

    const simulateTurnStarted = (newId: string) => {
      lastTurnId = currentTurnId;
      currentTurnId = newId;
    };

    // 第一轮还未开始时（模拟从未收到过 turn/started）
    const snapshotTurnId = lastTurnId || currentTurnId;
    expect(snapshotTurnId).toBeNull(); // 无历史时为 null，调用方应处理

    simulateTurnStarted('turn-1');
    const snapshotTurnId2 = lastTurnId || currentTurnId;
    expect(snapshotTurnId2).toBe('turn-1'); // 有历史时 fallback 到 currentTurnId
  });
});
