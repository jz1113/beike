import { apiFetch } from '@client/shared/api/apiClient';
import { useAppStore } from '@client/store';
import type { ApprovalDecision } from './assistantTurnTypes';

export async function approveAssistantTool(
  turnId: string,
  approvalId: string,
  decision: ApprovalDecision,
): Promise<boolean> {
  const res = await apiFetch('/api/assistant/turn/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnId, approvalId, decision }),
  });
  const data = await res.json();
  return Boolean(data.success);
}

export function executeClientToolAction(
  action: Record<string, unknown> | undefined,
  showToast: (msg: string) => void,
): void {
  if (!action?.action) return;

  const store = useAppStore.getState();

  switch (action.action) {
    case 'navigate': {
      const target = action.target_view as string;
      if (target) {
        store.setCurrentView(target as 'home' | 'workshop' | 'generate' | 'assets');
        showToast(String(action.message || '已切换工作台视图'));
      }
      break;
    }
    case 'load_workshop_product': {
      store.setWorkshopMode('storyboard_generate');
      store.setActiveWorkshopTab('studio');
      store.setCurrentView('workshop');
      if (action.itemId) {
        store.setProductData(
          {
            itemId: String(action.itemId),
            platform: 'jd',
            title: String(action.title || action.itemId),
            mainImages: [],
            detailImages: [],
            skuImages: [],
            allImages: [],
          },
          { main: [], details: [], skus: [] },
          '🤖 AI 助手载入',
        );
      }
      store.setStep(2);
      showToast(String(action.message || '已装载至种草工坊'));
      break;
    }
    case 'trigger_generate': {
      const prompt = String(action.prompt || '');
      if (prompt) {
        store.setAssistantInputDraft(prompt);
      }
      store.setCurrentView('generate');
      showToast(String(action.message || '已准备生图提示词'));
      break;
    }
    case 'set_workshop_arch': {
      const archId = String(action.arch_id || '');
      if (archId) {
        store.setSelectedArchId(archId);
        showToast(String(action.message || `已切换拍摄架构`));
      }
      break;
    }
    default:
      break;
  }
}
