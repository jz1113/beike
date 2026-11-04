import { listSalesPrompts } from './salesPrompts';

interface AdaptationProvenance {
  adaptedBeats: readonly unknown[];
  adaptedSourceKey: string;
  adaptedPromptVersion: string;
  spokenCopySourceKey?: string;
  spokenCopyPromptVersion?: string;
  spokenReviewPromptVersion?: string;
  spokenReviewSourceKey?: string;
}

/** Every spoken draft needs current semantic approval; original adaptation provenance stays intact. */
export async function ensureSalesProductionPromptsCurrent(plan: AdaptationProvenance, finalVideoPromptVersion: string, signal: AbortSignal, voiceMode?: 'speech' | 'voiceover' | 'none', finalVideoPromptId: 'final-video' | 'final-video-depth' = 'final-video'): Promise<void> {
  signal.throwIfAborted();
  const automatic = plan.adaptedBeats.length > 0 && Boolean(plan.adaptedSourceKey || plan.adaptedPromptVersion);
  if (automatic && !plan.adaptedPromptVersion) {
    throw new Error('当前自动改编未记录提示词版本，请重新适配商品后生成；原分镜和手工修改已保留。');
  }
  const prompts = await listSalesPrompts(signal);
  signal.throwIfAborted();
  const final = prompts.find((prompt) => prompt.id === finalVideoPromptId);
  const finalTitle = finalVideoPromptId === 'final-video-depth' ? '最终视频生成 · 深度视频版' : '最终视频生成 · 纯分镜版';
  if (!final?.configured || !final.prompt.trim()) throw new Error(`请先在提示词管理中保存「${finalTitle}」，不会使用其他模式或内置规则。`);
  if (final.version !== finalVideoPromptVersion) throw new Error(`最终视频生成提示词已更新（${finalTitle}），已停止提交，请核对最新提示词后再生成。`);
  if (voiceMode !== 'none' && plan.spokenCopySourceKey && !plan.spokenCopyPromptVersion) throw new Error('当前口播适配未记录提示词版本，请重新按商品自动改写；原分镜和手工修改已保留。');
  if (voiceMode !== 'none' && plan.spokenCopyPromptVersion) {
    const spoken = prompts.find((prompt) => prompt.id === 'spoken-copy');
    if (!spoken?.configured || !spoken.prompt.trim()) throw new Error('请先在提示词管理中保存「口播时长适配」；原分镜和手工修改已保留。');
    if (spoken.version !== plan.spokenCopyPromptVersion) throw new Error('口播时长适配提示词已更新，请重新按商品自动改写后生成；原分镜和手工修改已保留。');
  }
  if (voiceMode === 'speech' || voiceMode === 'voiceover') {
    const review = prompts.find((prompt) => prompt.id === 'spoken-review');
    if (!review?.configured || !review.prompt.trim()) throw new Error('请先在提示词管理中保存「口播语义验收」；原分镜已保留。');
    if (!plan.spokenReviewPromptVersion || !plan.spokenReviewSourceKey) throw new Error('当前口播尚未通过语义验收，已停止生成；原分镜和手工台词已保留。');
    if (review.version !== plan.spokenReviewPromptVersion) throw new Error('口播语义验收提示词已更新，请重新验收当前稿后生成；原分镜已保留。');
  }
  if (!automatic) return;
  const current = prompts.find((prompt) => prompt.id === 'plan-adapt');
  if (!current) throw new Error('未能读取当前商品分镜改编提示词，已停止生成，请刷新后重试。');
  if (!current.configured) throw new Error('请先在提示词管理中保存「商品分镜改编」。');
  if (current.version !== plan.adaptedPromptVersion) {
    throw new Error('商品分镜改编提示词已更新，请重新适配商品后生成；原分镜和手工修改已保留。');
  }
}
