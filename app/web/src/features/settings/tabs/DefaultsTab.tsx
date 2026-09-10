
import { Bot, Palette, Video } from 'lucide-react';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import { settingsPanelPad } from '@/shared/ui/layoutClasses';
import type { WorkflowModel } from '../settingsShared';
import { getEnabledMultimodalModelsFromSettings, setStoredMultimodalModelId } from '@beike/domain/workflowModels';

export interface DefaultsTabProps {
  customModels: WorkflowModel[];
  activeVisionModel: string;
  setActiveVisionModel: (v: string) => void;
  setActiveAssistantModel: (v: string) => void;
  setSelectedVisionModel: (v: any) => void;
  activeImageGenModel: string;
  setActiveImageGenModel: (v: string) => void;
  setSelectedImageGenModel: (v: any) => void;
  activeVideoGenModel: string;
  setActiveVideoGenModel: (v: string) => void;
  setQuickVideoModel: (v: string) => void;
  notifyModelsUpdated: () => void;
  showToast: (msg: string) => void;
}

export default function DefaultsTab({
  customModels,
  activeVisionModel,
  setActiveVisionModel,
  setActiveAssistantModel,
  setSelectedVisionModel,
  activeImageGenModel,
  setActiveImageGenModel,
  setSelectedImageGenModel,
  activeVideoGenModel,
  setActiveVideoGenModel,
  setQuickVideoModel,
  notifyModelsUpdated,
  showToast,
}: DefaultsTabProps) {

  return (
    <div className={`${settingsPanelPad} space-y-4 max-w-4xl animate-fade-in`}>
      {/* 标题 */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">默认核心大模型路由</h3>
        <p className="text-xs text-slate-500 mt-1">
          配置系统在多模态分析、商业生图与视频生成三大核心环节的默认调用模型
        </p>
      </div>

      {/* 核心大模型卡片组 */}
      <div className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-2xs divide-y divide-slate-100">
        {/* 1. 默认多模态大模型 */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8.5 h-8.5 rounded-xl bg-indigo-50 border border-indigo-100/70 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">默认多模态大模型</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100/80">Vision & LLM</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">负责审图分析、提示词分镜策划与 AI 导演对话助手</p>
            </div>
          </div>

          <div className="shrink-0 w-full sm:w-56">
            <select
              value={activeVisionModel}
              onChange={e => {
                const nextModel = e.target.value;
                setActiveVisionModel(nextModel);
                setActiveAssistantModel(nextModel);
                setSelectedVisionModel(nextModel);
                setStoredMultimodalModelId(nextModel);
                notifyModelsUpdated();
                showToast(`已设置默认多模态模型: ${nextModel}`);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs font-semibold text-slate-800 outline-hidden focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 cursor-pointer transition-all shadow-2xs truncate"
            >
              {getEnabledMultimodalModelsFromSettings(customModels).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. 默认商业生图引擎 */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8.5 h-8.5 rounded-xl bg-amber-50 border border-amber-100/70 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Palette className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">默认商业生图引擎</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-100/80">Image Gen</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">负责 4K 高清电商主图与分镜批量绘图出图</p>
            </div>
          </div>

          <div className="shrink-0 w-full sm:w-56">
            <select
              value={activeImageGenModel}
              onChange={e => {
                setActiveImageGenModel(e.target.value);
                setSelectedImageGenModel(e.target.value);
                localStorage.setItem('ai_image_gen_model', e.target.value);
                notifyModelsUpdated();
                showToast(`已设置默认生图引擎: ${e.target.value}`);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs font-semibold text-slate-800 outline-hidden focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-500/10 cursor-pointer transition-all shadow-2xs truncate"
            >
              {customModels.filter(m => m.isImage).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. 默认视频生成引擎 */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8.5 h-8.5 rounded-xl bg-sky-50 border border-sky-100/70 text-sky-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Video className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">默认视频生成引擎</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-semibold border border-sky-100/80">Video Gen</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">负责商品动态运镜与商业短视频生成</p>
            </div>
          </div>

          <div className="shrink-0 w-full sm:w-56">
            <select
              value={activeVideoGenModel}
              onChange={e => {
                setActiveVideoGenModel(e.target.value);
                setQuickVideoModel(e.target.value);
                localStorage.setItem('ai_video_gen_model', e.target.value);
                notifyModelsUpdated();
                showToast(`已设置默认视频引擎: ${e.target.value}`);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs font-semibold text-slate-800 outline-hidden focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-500/10 cursor-pointer transition-all shadow-2xs truncate"
            >
              {customModels.filter(m => m.isVideo).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 极简底部说明 */}
      <div className="p-3 rounded-2xl bg-slate-50/60 border border-slate-200/60 flex items-center justify-between gap-2 text-xs text-slate-500 flex-wrap">
        <span>如需配置自有 API 密钥或添加新模型，可前往「服务接口配置」</span>
        <div className="flex items-center gap-3 shrink-0 font-medium">
          <ExternalLinkAnchor
            href="https://ai.comfly.org"
            className="text-[11px] text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-1"
          >
            <span>Comfly 官网 ↗</span>
          </ExternalLinkAnchor>
          <ExternalLinkAnchor
            href="https://open.onebound.cn"
            className="text-[11px] text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1"
          >
            <span>万邦开放平台 ↗</span>
          </ExternalLinkAnchor>
        </div>
      </div>
    </div>
  );
}
