import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { useAppStore } from '@client/store';

function isEcommerceCanvas(project: { workshop?: unknown; nativeCommerce?: unknown }) {
  return Boolean(project.workshop) && !project.nativeCommerce;
}

/** Reuse the current ecommerce project, otherwise the latest one, otherwise create it. */
export function openEcommerceCanvas() {
  const canvas = useCanvasStore.getState();
  const existing = canvas.projects.find((project) => project.id === canvas.activeProjectId && isEcommerceCanvas(project))
    || canvas.projects.find(isEcommerceCanvas);
  if (existing) canvas.selectProject(existing.id);
  else canvas.createProject(undefined, 'ecommerce');
  useAppStore.getState().setCurrentView('canvas');
}
