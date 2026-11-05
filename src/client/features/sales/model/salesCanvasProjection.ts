import type { SalesCanvasProjection } from '@shared/domain/sales/salesCanvas';
import type { SalesCollectionState } from './salesCollectionDraft';
import type { AssembledSalesPrompt } from '@shared/domain/sales';
import { salesSubtitlesSrt } from './salesSubtitles';

export function salesCanvasProjection(state: SalesCollectionState, busy: string, assembled?: AssembledSalesPrompt | null): SalesCanvasProjection {
  const plan = state.productionPlan;
  const images = state.colorSelection.confirmedImageUrls.length;
  const voiceMode = assembled?.effectiveVoiceMode || (plan.presentationMode === 'clean_visual' ? 'none' : plan.voiceModeOverride || 'speech');
  const subtitles = assembled ? salesSubtitlesSrt(assembled.subtitles) : '';
  const status = (running: boolean, done: boolean) => running ? 'running' : done ? 'success' : 'idle';
  const outputs: SalesCanvasProjection['outputs'] = [];
  if (plan.generatedVideoUrl) outputs.push({ id: 'sales-raw', title: '生成原片', mediaType: 'video', url: plan.generatedVideoUrl });
  if (plan.voiceoverAudioUrl) outputs.push({ id: 'sales-voice', title: voiceMode === 'speech' ? '口播音色参考' : '旁白配音', mediaType: 'audio', url: plan.voiceoverAudioUrl });
  if (plan.mixedVideoUrl) outputs.push({ id: 'sales-final', title: '合成成片', mediaType: 'video', url: plan.mixedVideoUrl });
  if (subtitles) outputs.push({ id: 'sales-subtitles', title: 'SRT 字幕', mediaType: 'text', text: subtitles });
  return { draft: state, outputs, stages: {
    'sales-collect': { state: status(busy === 'collect', !!images), summary: `${state.productName || '待添加商品'}\n已确认 ${images} 张参考图，共 ${state.imageCatalog.length} 张。` },
    'sales-summary': { state: status(busy === 'summary' || busy === 'ocr', !!state.productSummary || !!state.sellingPoints), summary: `资料识别与卖点\n${state.productSummary ? '已保存卖点提炼' : state.sellingPoints ? '已填写商品资料' : '待识别或填写资料'}\n识别图片 ${state.ocrImages.length} 张。` },
    'sales-storyboard': { state: status(busy === 'adapt', !!plan.adaptedBeats.length), summary: `分镜与口播台词\n${state.selectedScriptId ? '已选参考脚本' : '待选择参考脚本'}\n已保存 ${plan.adaptedBeats.length} 段改写。` },
    'sales-voice': { state: status(busy === 'tts' || !!plan.pendingVoiceTask, !!plan.voiceoverAudioUrl || voiceMode === 'none'), summary: `${voiceMode === 'speech' ? '真人口播音色参考' : voiceMode === 'voiceover' ? '画外旁白配音' : '静音画面，无需配音'}\n${plan.pendingVoiceTask ? '正在接续原配音任务' : plan.voiceoverAudioUrl ? '音频已保存' : '可选择人声并生成试听'}\n完整口播台词在分镜节点编辑。` },
    'sales-video': { state: status(busy === 'video' || !!plan.pendingVideoTask, !!plan.generatedVideoUrl), summary: `视频生成\n${plan.pendingVideoTask ? '已提交，刷新后查询原任务' : plan.generatedVideoUrl ? '原片已保存' : '核对素材与模型后手动生成'}\n${plan.generatedVideoTaskId || plan.pendingVideoTask?.taskId || ''}` },
    'sales-subtitles': { state: subtitles ? 'success' : 'idle', summary: `字幕单独导出为 SRT\n${assembled?.subtitles.length || 0} 条字幕\n字幕文字在分镜节点编辑，不自动烧录进 MP4。` },
    'sales-export': { state: status(busy === 'mix' || !!plan.pendingMixTask, !!plan.mixedVideoUrl || !!plan.generatedVideoUrl), summary: `成片合成与导出\n${plan.pendingMixTask ? '正在恢复原合成任务' : plan.mixedVideoUrl ? '成片已保存' : plan.generatedVideoUrl ? '原片可导出，可继续配乐合成' : '等待视频生成'}\n可下载视频、音频与字幕。` },
  } };
}
