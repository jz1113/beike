import { expect, it } from 'vitest';
import type { AssistantSkill } from '@beike/domain/assistant/skills/types';
import { migrateTravelCopySkill } from '../migrateTravelCopySkill';

const original = {
  id: 'meituan-xhs-travel-copy', name: '旅行文案', description: '旅行文案',
  prompt: '- 必须有目的地及其对应的文化体验素材；美食素材缺失但任务要求具体美食时，询问对应美食。\n- 地名与技艺、美食对应关系不清，或核心素材缺失时，一次集中询问关键问题，暂不生成正式文案。\n- 可参与体验、古村活动、人群和季节未提供时，不自行补充。素材较少时缩短正文，不凑满类别。',
} as AssistantSkill;

it('迁移旧指令及导出文档，保留技能标识、工具配置及原对象', () => {
  const input = { ...original, markdownDoc: original.prompt, tools: ['test-tool'] };
  const migrated = migrateTravelCopySkill(input);
  expect(migrated.prompt).not.toContain('暂不生成正式文案');
  expect(migrated.markdownDoc).toBe(migrated.prompt);
  expect(migrated.id).toBe(input.id);
  expect(migrated.tools).toEqual(input.tools);
  expect(input.prompt).toContain('暂不生成正式文案');
  expect(migrateTravelCopySkill(migrated)).toBe(migrated);
});

it('不修改其他技能或用户已经重写的版本', () => {
  const other = { ...original, id: 'another-skill' };
  expect(migrateTravelCopySkill(other)).toBe(other);
  const custom = { ...original, prompt: '仅根据已审核素材写作。' };
  expect(migrateTravelCopySkill(custom)).toBe(custom);
});
