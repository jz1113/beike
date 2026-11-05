import { useCallback } from 'react';
import { salesCanvasStages, type SalesCanvasProjection, type SalesCanvasStage } from '@shared/domain/sales/salesCanvas';
import { useCanvasStore, type CanvasProject } from '@client/features/canvas/store/useCanvasStore';
import { projectSalesCanvas, salesCanvasBlockReasons } from '@client/features/canvas/model/salesCanvasProject';
import SalesCanvasController from '@client/features/sales/SalesCanvasController';
import type { SalesLibraryChoice, OpenSalesLibrary } from '@client/features/sales/model/salesWorkspace';

export function SalesCanvasBusiness({ project, ...props }: { project: CanvasProject; onOpenLibrary: OpenSalesLibrary; libraryChoice?: SalesLibraryChoice | null; onChoiceHandled?: () => void }) {
  const onProjection = useCallback((projection: SalesCanvasProjection) => {
    useCanvasStore.setState(state => ({ projects: state.projects.map(row => row.id === project.id ? projectSalesCanvas(row, projection) : row) }));
    const scene = useCanvasStore.getState().projects.find(row => row.id === project.id)?.studioScene;
    if (scene) document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow?.postMessage({ kind: 'studio:business-projection', projectId: project.id, nodes: scene.nodes }, location.origin);
  }, [project.id]);
  if (!project.sales || project.nativeCommerce) return null;
  const nodes = (project.studioScene?.nodes || []).flatMap(node => {
    const stage = (node.settings as Record<string, unknown>)?.beikeBusinessStage;
    return typeof stage === 'string' && Object.hasOwn(salesCanvasStages, stage) ? [{ id: node.id, stage: stage as SalesCanvasStage }] : [];
  });
  return <SalesCanvasController key={project.id} projectId={project.id} initialDraft={project.sales.draft} nodes={nodes} blockReasons={salesCanvasBlockReasons(project)} onProjection={onProjection} {...props} />;
}
