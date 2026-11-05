import { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_WORKSHOP_REFERENCES_EVENT, workshopReferenceTokenValue } from '@client/shared/navigation/commerceCanvas';
import { workshopCanvasStages, type WorkshopCanvasStage, type WorkshopCanvasProjection } from '@shared/domain/workshop/workshopCanvas';
import { useCanvasStore, type CanvasProject } from '@client/features/canvas/store/useCanvasStore';
import { projectWorkshopCanvas, workshopCanvasBlockReasons } from '@client/features/canvas/model/workshopCanvasProject';
import WorkshopCanvasController from '@client/features/workshop/WorkshopCanvasController';
import WorkshopAssetTools from '@client/features/assets/components/library/WorkshopAssetTools';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';

function WorkshopCanvasAssets({ skillsOpen, onBrowseReferences, onClose }: { skillsOpen: boolean; onBrowseReferences: () => void; onClose: () => void }) {
  const ref = useModalDialog(true, onClose);
  return <div className="fixed inset-0 z-[60] bg-white dark:bg-[#18191c]" ref={ref} role="dialog" aria-modal="true" aria-label="图文技能与参考图库" tabIndex={-1}>
    <header className="flex items-center justify-between border-b p-3"><h2>图文技能与参考图库</h2><button className="rounded-lg border px-4 py-2" onClick={onClose}>返回图文画布</button></header>
    <div className="flex h-[calc(100%-70px)] min-h-0 flex-col"><WorkshopAssetTools skillsOpen={skillsOpen} onCloseSkills={onClose} onBrowseReferences={onBrowseReferences} navigationTarget={null} /></div>
  </div>;
}

export function WorkshopCanvasBusiness({ project }: { project: CanvasProject }) {
  const [assets, setAssets] = useState(false);
  const [skills, setSkills] = useState(true);
  const seenReferences = useRef(0);
  const ecommerce = Boolean(project.workshop) && !project.nativeCommerce;
  useEffect(() => {
    if (!ecommerce) return;
    const openReferences = () => {
      const token = workshopReferenceTokenValue();
      if (seenReferences.current === token) return;
      seenReferences.current = token;
      setSkills(false);
      setAssets(true);
    };
    openReferences();
    window.addEventListener(OPEN_WORKSHOP_REFERENCES_EVENT, openReferences);
    return () => window.removeEventListener(OPEN_WORKSHOP_REFERENCES_EVENT, openReferences);
  }, [ecommerce, project.id]);
  const onProjection = useCallback((projection: WorkshopCanvasProjection) => {
    useCanvasStore.setState(state => ({ projects: state.projects.map(row => row.id === project.id ? projectWorkshopCanvas(row, projection) : row) }));
    const scene = useCanvasStore.getState().projects.find(row => row.id === project.id)?.studioScene;
    document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow?.postMessage({ kind: 'studio:business-projection', projectId: project.id, nodes: scene?.nodes }, location.origin);
  }, [project.id]);
  if (!project.workshop || project.nativeCommerce) return null;
  const nodes = (project.studioScene?.nodes || []).flatMap(node => {
    const stage = (node.settings as Record<string, unknown> | undefined)?.beikeBusinessStage;
    return typeof stage === 'string' && Object.hasOwn(workshopCanvasStages, stage) ? [{ id: node.id, stage: stage as WorkshopCanvasStage }] : [];
  });
  return <><WorkshopCanvasController key={project.id} projectId={project.id} sourceBatchId={project.workshop.sourceBatchId} nodes={nodes}
    blockReasons={workshopCanvasBlockReasons(project)} onProjection={onProjection} onSkills={() => { setSkills(true); setAssets(true); }} />{assets && <WorkshopCanvasAssets skillsOpen={skills} onBrowseReferences={() => setSkills(false)} onClose={() => setAssets(false)} />}</>;
}

