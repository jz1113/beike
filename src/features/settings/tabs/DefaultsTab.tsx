'use client';

import { Sparkles, ExternalLink, Bot, Palette, Video } from 'lucide-react';
import { ExternalLinkAnchor } from '@/shared/ui/ExternalLinkAnchor';
import type { WorkflowModel } from '../settingsShared';
import { getEnabledMultimodalModelsFromSettings, setStoredMultimodalModelId } from '@/lib/workflowModels';

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
              <div className="p-6 sm:p-8 space-y-6 max-w-4xl">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">默认核心大模型路由</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    系统统一采用 3 大核心模型体系：多模态大模型、商业生图引擎、视频生成引擎
                  </p>
                </div>

                {/* 🌟 软件打包分发 / 账号注册快捷跳转提示条 */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-indigo-950">
                        软件分发 / 使用您自己的 API Key
                      </h4>
                      <p className="text-xs text-indigo-700 mt-0.5">
                        若打包给他人使用，用户可直接点击链接前往各大服务商官网注册账号并填入属于自己的 Key。
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ExternalLinkAnchor
                      href="https://ai.comfly.org"
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/90 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                    >
                      <span>Comfly 网关注册 ↗</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </ExternalLinkAnchor>
                    <ExternalLinkAnchor
                      href="https://open.onebound.cn"
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-200/90 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                    >
                      <span>万邦开放平台 ↗</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </ExternalLinkAnchor>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 1. 默认多模态大模型 (涵盖视觉审图、架构推理、分镜策划、AI对话) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Bot className="w-4 h-4 text-indigo-600" />
                          <span>默认多模态大模型 (Multimodal / LLM)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">全模态旗舰</span>
                      </div>
                      <p className="text-xs text-slate-500">统一负责商品实物多角度审图分析、提示词分镜策划、品类专属架构推理与 AI 视觉导演对话助手 (推荐 Gemini 3.1 Pro / GPT-4o / Grok 4.6 / Claude 3.7)</p>
                    </div>

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
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {getEnabledMultimodalModelsFromSettings(customModels).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. 默认商业生图引擎 (Step 3 绘图) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Palette className="w-4 h-4 text-amber-600" />
                          <span>默认商业生图引擎 (Image Generation)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">4K超清生图</span>
                      </div>
                      <p className="text-xs text-slate-500">用于 4K 高清电商主图与分镜批量绘图出图 (推荐 Seedream 5.0 / GPT Image 2 / FLUX Pro)</p>
                    </div>

                    <select
                      value={activeImageGenModel}
                      onChange={e => {
                        setActiveImageGenModel(e.target.value);
                        setSelectedImageGenModel(e.target.value);
                        localStorage.setItem('ai_image_gen_model', e.target.value);
                        notifyModelsUpdated();
                        showToast(`已设置默认生图引擎: ${e.target.value}`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {customModels.filter(m => m.isImage).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. 默认视频生成引擎 (视频工坊) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Video className="w-4 h-4 text-sky-600" />
                          <span>默认视频生成引擎 (Video Generation)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold">商业短视频</span>
                      </div>
                      <p className="text-xs text-slate-500">用于商品动态运镜与商业短视频生成 (推荐 即梦 Seedance 2.5 / 2.0 mini / Veo 3 / Sora 2)</p>
                    </div>

                    <select
                      value={activeVideoGenModel}
                      onChange={e => {
                        setActiveVideoGenModel(e.target.value);
                        setQuickVideoModel(e.target.value);
                        localStorage.setItem('ai_video_gen_model', e.target.value);
                        notifyModelsUpdated();
                        showToast(`已设置默认视频引擎: ${e.target.value}`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {customModels.filter(m => m.isVideo).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
  );
}
