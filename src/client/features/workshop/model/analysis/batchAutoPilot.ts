import type { BatchProductItem } from '../batchTypes';

export interface AutoPilotDeps {
  successfulItems: BatchProductItem[];
  getItems: () => BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  startBatchVisionAnalyze: () => Promise<number>;
  setCurrentStage: (stage: number) => void;
  showToast: (msg: string) => void;
  setIsAutoPilotRunning: (running: boolean) => void;
  isAborted?: () => boolean;
}

/**
 * 批量完成分镜分析，停在提示词审核，不自动选图或生图。
 */
export async function startAutoPilotPipeline(deps: AutoPilotDeps): Promise<void> {
  if (deps.successfulItems.length === 0) {
    deps.showToast('⚠️ 当前没有已采集成功的商品');
    return;
  }

  const activeItems = deps.getItems().filter((item) => item.status === 'success' && item.selected);
  const itemsWithoutImages = activeItems.filter(
    (item) => !item.selectedProductImages.some((url) => typeof url === 'string' && url.trim()),
  );
  if (itemsWithoutImages.length > 0) {
    deps.setCurrentStage(2);
    deps.showToast(`请先为 ${itemsWithoutImages.length} 款商品手动选择至少 1 张商品图`);
    return;
  }

  deps.setIsAutoPilotRunning(true);
  deps.showToast('已启动辅助分析：按已手动选择的商品图生成分镜，完成后需你审核，不会自动生图。');

  try {
    // 批量并发生成提示词
    const successCount = await deps.startBatchVisionAnalyze();

    // 🚨【生产安全强阻断门禁】：严格检查是否所有选定商品都成功产出了经过 AI 深度分析优化的分镜提示词
    const currentActiveItems = deps.getItems().filter(i => i.status === 'success' && i.selected);
    const unreadyItems = currentActiveItems.filter(
      p => !p.analyzedSuccess || !p.prompts || p.prompts.length === 0
    );

    if (unreadyItems.length > 0 || successCount === 0) {
      deps.setIsAutoPilotRunning(false);
      // 严禁自动跳入阶段 4，停留在阶段 3 等待人工审核或重试。
      deps.setCurrentStage(3);
      deps.showToast(
        `分析未全部完成（${unreadyItems.length} 款未就绪），未启动生图。请查看各商品原因，修正配置或重试。`
      );
      return;
    }

    if (deps.isAborted?.()) {
      return;
    }

    // 分析完成后停在审核门，不自动生图。
    deps.setCurrentStage(3);
    deps.showToast('分镜分析完成，请审核提示词后再启动生图');

  } catch (err: unknown) {
    console.error('AutoPilot pipeline error:', err);
    deps.showToast(`流水线执行异常: ${err instanceof Error ? err.message : '未知错误'}`);
  } finally {
    deps.setIsAutoPilotRunning(false);
  }
}
