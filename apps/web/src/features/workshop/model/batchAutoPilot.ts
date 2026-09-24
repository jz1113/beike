import type { BatchProductItem } from './batchTypes';

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
 * 自动选图并完成分镜分析，停在提示词审核，不自动生图。
 */
export async function startAutoPilotPipeline(deps: AutoPilotDeps): Promise<void> {
  if (deps.successfulItems.length === 0) {
    deps.showToast('⚠️ 当前没有已采集成功的商品');
    return;
  }

  deps.setIsAutoPilotRunning(true);
  deps.showToast('已启动全自动生产流水线！正在执行分镜提示词分析...');

  try {
    // 1. 自动为未选图的商品兜底第一张主图
    deps.setItems(prev =>
      prev.map(p => {
        if (!p.selectedProductImages || p.selectedProductImages.length === 0) {
          const first = p.allTypedImages.slice(0, 1).map(t => t.url);
          return {
            ...p,
            selectedProductImages:
              first.length > 0 ? first : p.coverImage ? [p.coverImage] : [],
          };
        }
        return p;
      })
    );

    // 2. 批量并发生成提示词
    const successCount = await deps.startBatchVisionAnalyze();

    // 🚨【生产安全强阻断门禁】：严格检查是否所有选定商品都成功产出了经过 AI 深度分析优化的分镜提示词
    const currentActiveItems = deps.getItems().filter(i => i.status === 'success' && i.selected);
    const unreadyItems = currentActiveItems.filter(
      p => !p.analyzedSuccess || !p.prompts || p.prompts.length === 0
    );

    if (unreadyItems.length > 0 || successCount === 0) {
      deps.setIsAutoPilotRunning(false);
      // 🚨 严禁自动跳入阶段 4！强制停留在阶段 3【分镜提示词】，保护用户额度并等待重试
      deps.setCurrentStage(3);
      deps.showToast(
        `🚨 生产安全阻断：有 ${unreadyItems.length} 款商品提示词分析失败或超时，已终止自动生图！请点击单款重试或切换极速模型。`
      );
      return;
    }

    if (deps.isAborted?.()) {
      return;
    }

    // 3. 分析完成后停在审核门，不自动生图
    deps.setCurrentStage(3);
    deps.showToast('分镜分析完成，请审核提示词后再启动生图');

  } catch (err: any) {
    console.error('AutoPilot pipeline error:', err);
    deps.showToast(`流水线执行异常: ${err.message || '未知错误'}`);
  } finally {
    deps.setIsAutoPilotRunning(false);
  }
}
