import { useEffect, useState } from 'react';
import type { PetPose } from '@shared/domain/pets/atlas';
import type { CanvasPetLink } from '@client/shared/pets/petPreferences';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import type { CanvasProject } from '@client/features/canvas/model/types';

function activity(project: CanvasProject) {
  const pending = new Set<string>(), finished = new Map<string, PetPose>();
  if (project.studioScene) {
    for (const node of project.studioScene.nodes) {
      const settings = node.settings as Record<string, unknown> | undefined;
      if (node.isGenerating || settings?.textNodeIsAnalyzing || settings?.isGenerating) pending.add(node.id);
      else if (node.errorMsg || settings?.error) finished.set(node.id, 'failed');
      else if (node.content || node.videoUrl || node.imageUrl || settings?.audioUrl) finished.set(node.id, 'success');
    }
  } else {
    for (const node of project.nodes) {
      if (node.status === 'generating') pending.add(node.id);
      else if (node.status === 'error') finished.set(node.id, 'failed');
      else if (node.status === 'success') finished.set(node.id, 'success');
    }
  }
  return {pending, finished, nodes:(project.studioScene?.nodes ?? project.nodes).length,
    edges:(project.studioScene?.connections ?? project.edges ?? []).length};
}

export function useCanvasPetActivity(link: CanvasPetLink | null) {
  const [busy,setBusy] = useState(false);
  const [flash,setFlash] = useState<PetPose|null>(null);
  useEffect(() => {
    let timer = 0;
    setBusy(false); setFlash(null);
    if (!link || link === 'off') return;
    let previous: ReturnType<typeof activity> | undefined;
    let lastProject: CanvasProject | undefined;
    function update() {
      const state = useCanvasStore.getState();
      const project = state.projects.find(p => p.id === state.activeProjectId);
      if (project === lastProject) return;
      const same = project && lastProject?.id === project.id;
      lastProject = project;
      if (!same) {previous=undefined;window.clearTimeout(timer);setFlash(null);}
      if (!project) {setBusy(false);return;}
      const current = activity(project);
      setBusy(current.pending.size > 0);
      if (previous) {
        const completed = [...previous.pending].map(id=>current.finished.get(id));
        const edit = current.nodes > previous.nodes || current.edges > previous.edges;
        const next = completed.includes('failed') ? 'failed' : completed.includes('success') ? 'success'
          : link === 'all' && edit ? 'working' : null;
        if (next) {
          window.clearTimeout(timer);setFlash(next);
          timer=window.setTimeout(()=>setFlash(null),1400);
        }
      }
      previous = current;
    }
    update();
    const stop = useCanvasStore.subscribe(update);
    return ()=>{stop();window.clearTimeout(timer);};
  },[link]);
  return {busy,flash};
}
