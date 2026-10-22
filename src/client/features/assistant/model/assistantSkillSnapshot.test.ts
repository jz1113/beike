import { expect, it } from 'vitest';
import { snapshotAssistantSkill } from './assistantSkillSnapshot';
import { normalizeAssistantSessions } from '@client/store/persist/assistantValidation';

it('preserves the sent version and resource text through package edits and history restoration', () => {
  const skill = { id: 'custom', name: '测试', description: '用途', prompt: '旧主指令', libraryVersion: 'v1',
    tools: ['read_document'], files: [{ path: 'references/example.md', content: '旧资料' }] };
  const usedSkill = snapshotAssistantSkill(skill);
  skill.prompt = '新主指令';
  skill.files[0].content = '新资料';
  skill.libraryVersion = 'v2';
  const [session] = normalizeAssistantSessions([{ id: 'session', messages: [{ id: 'message', role: 'user', content: '需求', timestamp: 1, usedSkill }] }]);
  const restored = session.messages[0].usedSkill;
  expect(restored?.libraryVersion).toBe('v1');
  expect(restored?.systemPrompt).toContain('旧主指令');
  expect(restored?.systemPrompt).not.toContain('新主指令');
  expect(restored?.resources?.[0].content).toBe('旧资料');
  expect(restored?.allowedTools).toContain('read_document');
});
