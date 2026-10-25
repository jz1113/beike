import { getCanvasWorkspaceSnapshot } from '@client/shared/workspace/canvasWorkspace';

/** Build the small active-workspace context sent with a new assistant turn. */
export function buildAssistantWorkspaceSnapshot(currentView: string, currentStep: unknown, productTitle?: string): Record<string, unknown> {
  if (currentView === 'canvas') return getCanvasWorkspaceSnapshot();
  if (currentView === 'workshop') {
    return {
      workspaceType: 'workshop',
      title: productTitle || '电商图文',
      summary: productTitle ? `当前已加载商品「${productTitle}」，处于电商图文第 ${currentStep || 1} 步。` : '当前尚未加载商品。',
    };
  }
  return { workspaceType: ['generate', 'assets', 'home'].includes(currentView) ? currentView : 'other' };
}
