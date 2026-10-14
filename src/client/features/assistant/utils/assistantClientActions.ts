import { apiFetch } from '@client/shared/api/apiClient';
import { useAppStore } from '@client/store';
import type { ApprovalDecision } from './assistantTurnTypes';
import { isAppView } from '@client/store/appView';
import { getReplyReferenceMedia, prepareAssistantImagePrompt } from './assistantPromptReferences';

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
  if (!res.ok || !data.success) throw new Error(data.error || '审批提交失败，请重试');
  return true;
}

export function executeClientToolAction(
  action: Record<string, unknown> | undefined,
  showToast: (msg: string) => void,
  originSessionId?: string,
): void {
  if (!action?.action) return;

  const store = useAppStore.getState();
  if (originSessionId && store.currentAssistantSessionId !== originSessionId) {
    showToast('原会话的操作结果已保留；切换会话后不会修改当前工作区');
    return;
  }

  switch (action.action) {
    case 'navigate': {
      const target = action.target_view as string;
      if (target && isAppView(target)) {
        store.setCurrentView(target);
        showToast(String(action.message || '已切换工作台视图'));
      }
      break;
    }
    case 'load_workshop_product': {
      const product = action.product as Record<string, unknown> | undefined;
      const images = action.images as { main?: string[]; details?: string[]; skus?: string[] } | undefined;
      const urls = (value: unknown) => Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && Boolean(url)) : [];
      const imageGroups = { main: urls(images?.main), details: urls(images?.details), skus: urls(images?.skus) };
      if (!product?.itemId || ![...imageGroups.main, ...imageGroups.details, ...imageGroups.skus].length) {
        showToast('未找到可载入的商品图片，请先采集商品或从商品库选择');
        break;
      }
      store.setWorkshopMode('storyboard_generate');
      store.setActiveWorkshopTab('studio');
      store.setCurrentView('workshop');
      store.setProductData({ itemId: String(product.itemId), title: String(product.title || product.itemId),
        platform: String(product.platform || 'local'), price: typeof product.price === 'number' ? product.price : String(product.price || ''),
        picUrl: typeof product.picUrl === 'string' ? product.picUrl : imageGroups.main[0] }, imageGroups, '🤖 AI 助手载入');
      store.setStep(2);
      showToast(String(action.message || '已装载至电商工坊'));
      break;
    }
    case 'trigger_generate': {
      const prompt = String(action.prompt || '');
      if (!prompt.trim()) break;
      const messages = store.assistantSessions.find((session) => session.id === (originSessionId || store.currentAssistantSessionId))?.messages || [];
      const reply = [...messages].reverse().find((message) => message.role === 'assistant');
      try {
        const prepared = prepareAssistantImagePrompt(prompt, reply ? getReplyReferenceMedia(messages, reply.id) : []);
        store.setQuickRefImages(prepared.urls);
        store.setQuickPrompt(prepared.prompt);
        store.setQuickGenMode('image');
        store.setCurrentView('home');
        store.setIsAssistantOpen(false);
        showToast('已载入首页生图输入，请检查提示词、参考图和生成设置后点击生成');
      } catch (error) {
        showToast(error instanceof Error ? error.message : '生图提示词载入失败');
      }
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
