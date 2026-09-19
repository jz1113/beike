import { expect, it, vi } from 'vitest';
import type { ApprovalRequestItem, ToolCallItem } from '@beike/domain/assistant/types';
const db = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), transaction: vi.fn() }));
vi.mock('@beike/server-kit/prisma', () => ({ prisma: { assistantTurnItem: { upsert: db.upsert }, assistantTurn: { update: db.update }, $transaction: db.transaction } }));
import { extractItemFields, updateTurnStatus, upsertItem, upsertItems } from './assistantTurnPersist';
it.each([['pending', 'running'], ['accepted', 'done'], ['declined', 'error'], ['expired', 'cancelled']] as const)('persists approval %s as %s', (status, storedStatus) => {
  const item: ApprovalRequestItem = { id: 'approval', approvalId: 'approval', kind: 'approvalRequest', createdAt: 1, toolName: 'tool', displayName: 'Tool', args: {}, status };
  expect(extractItemFields(item).status).toBe(storedStatus);
});
it('does not mark an awaiting-approval turn as completed', async () => {
  await updateTurnStatus('turn', 'awaiting_approval');
  expect(db.update).toHaveBeenLastCalledWith({ where: { id: 'turn' }, data: { status: 'awaiting_approval', completedAt: null } });
});
it('updates tool arguments for incremental and bulk persistence', async () => {
  const item: ToolCallItem = { id: 'tool', kind: 'toolCall', createdAt: 1, name: 'tool', displayName: 'Tool', args: '{"query":"complete"}', status: 'done', callId: 'call' };
  await upsertItem('turn', item);
  expect(db.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: expect.objectContaining({ argsJson: item.args }) }));
  await upsertItems('turn', [item]);
  expect(db.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: expect.objectContaining({ argsJson: item.args }) }));
});
