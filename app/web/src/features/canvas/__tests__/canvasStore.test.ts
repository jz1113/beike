import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '../store/useCanvasStore';

describe('useCanvasStore 画布状态管理', () => {
  beforeEach(() => {
    // 每个用例使用独立状态
    useCanvasStore.setState({
      activeProjectId: null,
      projects: [],
    });
  });

  it('初始状态不注入示例项目', () => {
    const state = useCanvasStore.getState();
    expect(state.projects).toHaveLength(0);
    expect(state.activeProjectId).toBeNull();
  });

  it('支持新建项目并自动激活该项目', () => {
    const store = useCanvasStore.getState();
    const prevCount = store.projects.length;

    const newProj = store.createProject('测试商业分镜画布');
    const updated = useCanvasStore.getState();

    expect(updated.projects.length).toBe(prevCount + 1);
    expect(updated.activeProjectId).toBe(newProj.id);
    expect(updated.projects[0].title).toBe('测试商业分镜画布');
    expect(updated.projects[0].nodes.length).toBe(0);
  });

  it('支持重命名项目', () => {
    const store = useCanvasStore.getState();
    const proj = store.createProject('旧标题');

    store.updateProjectTitle(proj.id, '全新标题');
    const updated = useCanvasStore.getState();
    const target = updated.projects.find((p) => p.id === proj.id);

    expect(target?.title).toBe('全新标题');
  });

  it('支持删除项目，并在当前激活时清空 activeProjectId', () => {
    const store = useCanvasStore.getState();
    const proj = store.createProject('待删除项目');
    expect(useCanvasStore.getState().activeProjectId).toBe(proj.id);

    store.deleteProject(proj.id);
    const updated = useCanvasStore.getState();

    expect(updated.projects.some((p) => p.id === proj.id)).toBe(false);
    expect(updated.activeProjectId).toBeNull();
  });

  it('支持向画布中添加节点与删除节点', () => {
    const store = useCanvasStore.getState();
    const proj = store.createProject('节点测试画布');

    store.addNode(proj.id, {
      type: 'image',
      title: '测试角色图',
      imageUrl: 'https://example.com/test.png',
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });

    const updated = useCanvasStore.getState();
    const updatedProj = updated.projects.find((p) => p.id === proj.id);
    const addedNode = updatedProj?.nodes.find((n) => n.title === '测试角色图');

    expect(addedNode).toBeDefined();
    expect(addedNode?.imageUrl).toBe('https://example.com/test.png');

    // 测试删除节点
    if (addedNode) {
      store.deleteNode(proj.id, addedNode.id);
      const afterDeleteProj = useCanvasStore.getState().projects.find((p) => p.id === proj.id);
      expect(afterDeleteProj?.nodes.some((n) => n.id === addedNode.id)).toBe(false);
    }
  });

  it('支持向画布中添加分镜排版框 (frame) 与便签 (note)', () => {
    const store = useCanvasStore.getState();
    const proj = store.createProject('排版测试画布');

    store.addNode(proj.id, {
      type: 'frame',
      title: '分镜排版框 (16:9)',
      x: 100,
      y: 120,
      width: 400,
      height: 280,
    });

    store.addNode(proj.id, {
      type: 'note',
      title: '灵感便签',
      content: '主色调强调电影质感',
      x: 520,
      y: 120,
      width: 260,
      height: 180,
    });

    const updatedProj = useCanvasStore.getState().projects.find((p) => p.id === proj.id);
    expect(updatedProj?.nodes.some((n) => n.type === 'frame')).toBe(true);
    expect(updatedProj?.nodes.some((n) => n.type === 'note')).toBe(true);
  });

  it('支持在画板中退出并返回项目列表 (selectProject(null))', () => {
    const store = useCanvasStore.getState();
    const proj = store.createProject('独立画板');
    expect(useCanvasStore.getState().activeProjectId).toBe(proj.id);

    // 模拟点击左上角四角星或下拉菜单中的“返回全部项目列表”
    store.selectProject(null);
    expect(useCanvasStore.getState().activeProjectId).toBeNull();
  });
});
