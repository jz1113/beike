import { expect, it } from 'vitest';
import { resolveTaskPolicy, selectReferenceImages, toolsForTask } from './taskPolicy';
import { getOpenAITools } from './tools/defs';
const images = Array.from({ length: 44 }, (_, i) => ({ url: `https://img.test/${i}.jpg`, label: `素材 ${i + 1}`, sourceUrl: `source${Math.floor(i / 15)}` }));
it('图文版式规划不变成全量筛选或实际生图', () => {
  const policy = resolveTaskPolicy('参考刚才采集的图片版式，选5-8个城市，生成至少6张图文内容，封面与每页都有文字，先进行提示词规划');
  expect(policy).toEqual({ mode: 'plan', deliverable: 'storyboard', referenceScope: 'sample' });
  const selected = selectReferenceImages(images, '至少6张，第2页写城市介绍', policy.referenceScope);
  expect(selected.images).toHaveLength(6);
  expect(new Set(selected.images.map(image => image.sourceUrl)).size).toBe(3);
});
it('明确选图才做全量筛选，显式范围优先', () => {
  expect(resolveTaskPolicy('从全部图片里挑3张封面').referenceScope).toBe('all');
  expect(resolveTaskPolicy('只写文案，不用分析图片').referenceScope).toBe('none');
  expect(resolveTaskPolicy('参考版式', 'act', 'none')).toMatchObject({ mode: 'act', referenceScope: 'none' });
  expect(selectReferenceImages(images, '@图片41 @图片2', 'sample').images).toEqual([images[40], images[1]]);
  expect(() => selectReferenceImages(images, '@图片50', 'sample')).toThrow('50');
});
it('规划模式不暴露生成工具或 MCP，空白名单不放开全部工具', () => {
  const names = getOpenAITools([], toolsForTask('plan')).map(tool => tool.function.name);
  expect(names).toContain('execute_code');
  expect(names).not.toContain('trigger_generate');
  expect(names).not.toContain('spawn_subagent');
  expect(names).not.toContain('workspace_navigate');
  expect(getOpenAITools([], [])).toHaveLength(1);
  expect(toolsForTask('plan', ['trigger_generate'])).toEqual(['execute_code']);
});
