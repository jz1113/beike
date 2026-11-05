import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { useAppStore } from '@client/store';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { getEnabledMultimodalModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { videoPromptMessages, videoPromptSkill, type VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';

export interface VideoPromptOptimization {
  videoModel?: string;
  videoMode?: string;
  /** Editable draft and exact user-approved text; neither implies a video has been generated. */
  draft?: string;
  submitted?: string;
  inputKey?: string;
  original: string;
  optimized: string;
  skillId: string;
  revision: string;
  sourceUrl: string;
  textModel: string;
}

/** One text-model call before enqueueing; failure never silently submits the original. */
export async function optimizeVideoPrompt(input: VideoPromptInput, signal: AbortSignal): Promise<VideoPromptOptimization | undefined> {
  const messages = videoPromptMessages(input), skill = videoPromptSkill(input.model, input.mode);
  if (!messages || !skill) return;
  signal.throwIfAborted();
  const configured = modalityPickerSelections('chat') ?? getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(), 'assistant');
  const selected = useAppStore.getState().assistantModel;
  const textModel = configured.find(model => model.id === selected)?.id || configured[0]?.id;
  if (!textModel) throw new Error('提示词优化需要文本模型，请在模型设置中启用文本模型，或关闭此节点的生成前优化');
  const response = await apiFetch('/api/generate/canvas-text', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: textModel, messages, max_tokens: 4096, ...getMultimodalClientOverrides(textModel) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '提示词优化失败，请重试或关闭优化');
  const choice = data.choices?.[0], content = choice?.message?.content;
  recordChatTokens({ modelId: textModel, type: 'chat', usage: data.usage });
  if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) throw new Error('提示词优化没有完整返回正文，视频尚未提交');
  const optimized = content.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim();
  if (!optimized || optimized.length > 20_000) throw new Error('优化稿为空或过长，视频尚未提交');
  signal.throwIfAborted();
  return { videoModel:input.model,videoMode:input.mode,original: input.prompt, optimized, skillId: skill.id, revision: skill.source!.revision, sourceUrl: skill.source!.url, textModel };
}
