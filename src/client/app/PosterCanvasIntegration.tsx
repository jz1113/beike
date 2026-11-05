import { useCallback } from 'react';
import { useCanvasStore, type CanvasProject } from '@client/features/canvas/store/useCanvasStore';
import { posterCanvasStages, posterCanvasBlockReasons } from '@client/features/canvas/model/posterCanvasProject';
import type { PosterItem } from '@client/features/poster/model/posterTypes';
import PosterCanvasPanel from '@client/features/poster/PosterCanvasPanel';

export function PosterCanvasBusiness({ project }: { project: CanvasProject }) {
  const onItems = useCallback((items: PosterItem[]) => {
    useCanvasStore.setState(state => ({ projects: state.projects.map(row => {
      if (row.id !== project.id || !row.studioScene) return row;
      const nodes = [...row.studioScene.nodes];
      let changed = false;
      items.forEach((item, index) => {
        if (!item.resultUrl || item.status !== 'complete' || row.poster?.hiddenOutputIds?.includes(item.id)) return;
        const id = `${project.id}-poster-output-${item.id}`;
        const previous = nodes.findIndex(node => node.id === id);
        if (previous >= 0 && nodes[previous].content === item.resultUrl) return;
        const output = { id, type: 'input-image', nodeName: item.coverTitle || '生成封面', content: item.resultUrl,
          x: 100 + index * 380, y: 1000, width: 320, height: 400,
          settings: { mediaType: 'image', beikeBusinessOutput: true, beikeBusinessOutputId: item.id } };
        if (previous >= 0) nodes[previous] = { ...nodes[previous], ...output };
        else nodes.push(output);
        changed = true;
      });
      const complete = items.filter(item => item.status === 'complete').length;
      const failed = items.filter(item => item.status === 'failed').length;
      const running = items.some(item => ['rewriting', 'prompting', 'rendering'].includes(item.status));
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index], settings = node.settings as Record<string, unknown> | undefined;
        const stage = settings?.beikeBusinessStage;
        if (typeof stage !== 'string' || !Object.hasOwn(posterCanvasStages, stage)) continue;
        const summary = stage === 'poster-template' ? '选用共享模板，或由系统自动匹配模板。'
          : stage === 'poster-input' ? `${items.length} 条商品与标题已载入`
          : stage === 'poster-export' ? `${complete} 张成品可下载，结果同步到画布`
          : `共 ${items.length} 条 · 完成 ${complete} · 失败 ${failed}${running ? ' · 生成中' : ''}`;
        const status = stage === 'poster-production' ? running ? 'running' : failed ? 'error' : complete ? 'success' : 'idle'
          : stage === 'poster-export' ? complete ? 'success' : 'idle' : items.length ? 'success' : 'idle';
        if (settings?.text !== summary || settings?.beikeBusinessState !== status) {
          nodes[index] = { ...node, settings: { ...settings, text: summary, beikeBusinessState: status } }; changed = true;
        }
      }
      if (!changed) return row;
      return { ...row, updatedAt: Date.now(), studioScene: { ...row.studioScene, nodes } };
    }) }));
    const nodes = useCanvasStore.getState().projects.find(row => row.id === project.id)?.studioScene?.nodes;
    document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow?.postMessage({ kind: 'studio:business-projection', projectId: project.id, nodes }, location.origin);
  }, [project.id]);
  if (!project.poster || project.nativeCommerce) return null;
  const nodes = (project.studioScene?.nodes || []).flatMap(node => {
    const stage = (node.settings as Record<string, unknown>)?.beikeBusinessStage;
    return typeof stage === 'string' && Object.hasOwn(posterCanvasStages, stage) ? [{ id: node.id, stage }] : [];
  });
  return <PosterCanvasPanel key={project.id} projectId={project.id} nodes={nodes} blockReasons={posterCanvasBlockReasons(project)} onItems={onItems} />;
}
