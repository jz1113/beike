import React, { useRef } from 'react';
import {
  Lightbulb,
  ListTree,
  Sparkles,
  UploadCloud,
  Check,
  ArrowUp,
  Square,
  AlertCircle,
} from 'lucide-react';
import { PPT_PRESET_TEMPLATES, usePptStore } from '../store/usePptStore';
import { StudioModelCapsule } from '@client/shared/ui/StudioModelCapsule';

const IDEA_PRESETS = [
  '具身智能与人形机器人的商业化落地路径',
  '2026 全球跨境电商全托管与增长策略',
  '大语言模型在企业私有知识库的落地实践',
  '新一代 Clean Tech 与绿色储能商业提案',
];

interface Props {
  onOpenSettings?: () => void;
}

export const PptInputStage: React.FC<Props> = ({ onOpenSettings }) => {
  const {
    creationType,
    setCreationType,
    ideaPrompt,
    setIdeaPrompt,
    outlineText,
    setOutlineText,
    aspectRatio,
    setAspectRatio,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedChatModel,
    setSelectedChatModel,
    selectedImageModel,
    setSelectedImageModel,
    renderMode,
    setRenderMode,
    generateOutline,
    isGeneratingOutline,
    referenceFiles,
    addReferenceFile,
    error,
  } = usePptStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      addReferenceFile({
        id: `ref_${Date.now()}_${i}`,
        name: file.name,
        url: URL.createObjectURL(file),
        size: file.size,
        type: file.type,
        extractedImages: [],
      });
    }
  };

  const handleStartGenerate = () => {
    if (creationType === 'idea' && !ideaPrompt.trim()) return;
    if (creationType === 'outline' && !outlineText.trim()) return;
    void generateOutline();
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-8 pt-16 sm:px-6 max-w-[980px] mx-auto w-full space-y-6 select-none animate-fade-in">
      {/* 居中 Hero 区域（对齐图2形式） */}
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[40px]">
          一键生成商业演示 PPT
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          从想法、大纲或参考资料出发，由系统同步的语言模型设计论断式大纲，视觉生图大模型端到端渲染高清商业幻灯片。
        </p>
      </div>

      {/* 模型与设计模板胶囊区（核心整改：直接选用系统同步的 Chat 与 Image 模型） */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        <StudioModelCapsule
          modality="chat"
          label="大纲架构"
          value={selectedChatModel}
          onChange={(modelId) => setSelectedChatModel(modelId)}
          onOpenSettings={onOpenSettings}
        />
        <StudioModelCapsule
          modality="image"
          label={renderMode === 'layout' ? '配图' : '幻灯片渲染'}
          value={selectedImageModel}
          onChange={(modelId) => setSelectedImageModel(modelId)}
          onOpenSettings={onOpenSettings}
        />
        <button type="button" onClick={() => setRenderMode(renderMode === 'layout' ? 'visual' : 'layout')} className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold dark:border-white/10 dark:bg-[#1C1C20]/80">
          {renderMode === 'layout' ? '可编辑排版' : '整页视觉渲染'}
        </button>

        {/* 模板风格胶囊 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PPT_PRESET_TEMPLATES.slice(0, 3).map((tmpl) => {
            const isActive = tmpl.id === selectedTemplateId;
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => setSelectedTemplateId(tmpl.id)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#1C1C20]/80 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                {isActive && <Check className="h-3 w-3" />}
                <span>{tmpl.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 灵感参考胶囊 */}
      {creationType === 'idea' && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium">
            <Sparkles className="h-3 w-3 text-amber-500" /> 填入参考主题:
          </span>
          {IDEA_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setIdeaPrompt(preset)}
              className="rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#1B1B1E] px-3 py-1 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-medium truncate max-w-[240px]"
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {/* 创作模式切换 Tab */}
      <div className="flex justify-center">
        <div className="inline-flex max-w-full rounded-full bg-slate-100 dark:bg-white/10 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setCreationType('idea')}
            className={`inline-flex min-w-[140px] items-center justify-center gap-2 rounded-full px-5 py-2 text-xs sm:text-sm font-bold transition-all ${
              creationType === 'idea'
                ? 'bg-black dark:bg-white text-white dark:text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span>核心想法起步</span>
          </button>
          <button
            type="button"
            onClick={() => setCreationType('outline')}
            className={`inline-flex min-w-[140px] items-center justify-center gap-2 rounded-full px-5 py-2 text-xs sm:text-sm font-bold transition-all ${
              creationType === 'outline'
                ? 'bg-black dark:bg-white text-white dark:text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <ListTree className="h-4 w-4 text-indigo-500" />
            <span>输入已有大纲</span>
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 沉浸式核心输入卡片（图2风格） */}
      <section className="relative min-h-[300px] overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 dark:border-white/10 bg-white/80 dark:bg-[#1B1B1E]/80 text-left transition hover:border-indigo-300 dark:hover:border-indigo-400/50 hover:bg-white dark:hover:bg-[#1B1B1E] p-6 sm:p-8 shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)]">
        <div className="relative min-h-[220px] flex flex-col justify-between">
          <div className="space-y-3">
            {creationType === 'idea' ? (
              <textarea
                rows={5}
                value={ideaPrompt}
                onChange={(e) => setIdeaPrompt(e.target.value)}
                placeholder="在此输入您的演示文稿主题或想法（例如：探讨 2026 年多模态 AI 与具身智能的发展趋势、商业落地痛点与团队的破局方案）..."
                className="w-full resize-none border-0 bg-transparent p-0 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
              />
            ) : (
              <textarea
                rows={6}
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                placeholder={'在此粘贴已有的大纲草稿，如：\n## Part 1: 行业痛点与核心挑战\n- 传统制作链路冗长且沟通成本高\n- 缺乏跨模态资产沉淀能力\n## Part 2: 破局与解决方案\n- 端到端 AI 自动化渲染生成'}
                className="w-full resize-none font-mono border-0 bg-transparent p-0 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
              />
            )}

            {/* 参考文件快捷上传栏 */}
            <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.md,.txt,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
              >
                <UploadCloud className="h-4 w-4" />
                <span>添加参考文件 ({referenceFiles.length})</span>
              </button>

              {referenceFiles.length > 0 && (
                <div className="flex items-center gap-1 truncate max-w-[280px]">
                  {referenceFiles.map((f) => (
                    <span key={f.id} className="truncate px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[10px]">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 卡片底部控制条与圆形大按钮 */}
          <div className="mt-6 pt-4 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
            {/* 画幅比例 */}
            <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { void generateOutline(undefined, true); }} className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500">用示例填充</button>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  aspectRatio === '16:9'
                    ? 'bg-white dark:bg-black text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white dark:text-slate-400'
                }`}
              >
                16:9 宽屏演讲
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('4:3')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  aspectRatio === '4:3'
                    ? 'bg-white dark:bg-black text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white dark:text-slate-400'
                }`}
              >
                4:3 经典汇报
              </button>
            </div>
            </div>

            {/* 右下角生成大按钮 */}
            <div>
              {isGeneratingOutline ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 dark:bg-white px-5 py-2.5 text-xs font-bold text-white dark:text-slate-950 shadow-md">
                  <Square className="h-3 w-3 animate-spin" />
                  <span>架构师正在设计大纲…</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartGenerate}
                  disabled={creationType === 'idea' ? !ideaPrompt.trim() : !outlineText.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title="立即生成演示大纲与幻灯片"
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
