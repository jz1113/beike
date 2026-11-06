import { describe, expect, it } from 'vitest';
import { createVideoWorkflowProject, videoWorkflowTemplates } from './videoWorkflowProjects';
import { normalizeCanvasProjects, visibleCanvasProjects } from '../store/canvasProjectDefaults';

describe('视频复刻流程模板', () => {
  for (const template of videoWorkflowTemplates) {
    it(`${template.title} 可持久化并重开，流程连线不引用缺失节点`, () => {
      const project = createVideoWorkflowProject(template.kind, `test-${template.kind}`, 100);
      const restored = normalizeCanvasProjects(JSON.parse(JSON.stringify([project])))[0];
      expect(visibleCanvasProjects([restored])).toHaveLength(1);
      const scene = restored.studioScene!;
      const ids = new Set(scene.nodes.map(node => node.id));
      expect(ids.size).toBe(template.kind === 'w3-copy' ? 10 : 8);
      expect(scene.connections).toHaveLength(template.kind === 'w3-copy' ? 14 : 5);
      for (const edge of scene.connections) {
        expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
        expect(edge.from).not.toBe(edge.to);
      }
      expect(scene.nodes.every(node => !node.isGenerating && !node.beikeTaskId)).toBe(true);
      if (template.kind === 'w3-copy') {
        expect(scene.nodes.filter(node => node.type === 'input-image')).toHaveLength(4);
        expect(scene.connections.filter(edge => edge.to.endsWith('-video')).map(edge => edge.from.split('-').at(-1)).sort()).toEqual(['analysis', 'keyframe']);
        return;
      }
      expect(scene.nodes.every(node => (node.settings as { text: string }).text === node.content)).toBe(true);
      expect(String(scene.nodes[0].content)).toContain('未接通自动执行');
    });
  }
  it('重复创建为独立可编辑项目，不共享节点和设置', () => {
    const a = createVideoWorkflowProject('depth-copy', 'a', 1);
    const b = createVideoWorkflowProject('depth-copy', 'b', 2);
    a.studioScene!.nodes[0].content = '我的方案';
    expect(b.studioScene!.nodes[0].content).not.toBe('我的方案');
    expect(a.studioScene!.nodes[0].id).not.toBe(b.studioScene!.nodes[0].id);
  });
  it('导入正文能显示，已有编辑文本不会被模板覆盖', () => {
    const project = createVideoWorkflowProject('depth-copy', 'import', 1);
    project.studioScene!.nodes[0].settings = {};
    project.studioScene!.nodes[1].settings = { text: '用户修改' };
    const restored = normalizeCanvasProjects([project])[0].studioScene!;
    expect((restored.nodes[0].settings as { text: string }).text).toBe(restored.nodes[0].content);
    expect((restored.nodes[1].settings as { text: string }).text).toBe('用户修改');
  });
});
