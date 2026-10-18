import React from 'react';
import { 
  BookmarkCheck, 
  Plus, 
  Trash2, 
  Sparkles, 
  Layers, 
  Check, 
  Loader2 
} from 'lucide-react';
import { CategoryItem } from '@shared/domain/prompts/vision';
import { ExtractedRecipeData } from './types';

interface RecipeEditorPanelProps {
  extractedRecipe: ExtractedRecipeData;
  setExtractedRecipe: React.Dispatch<React.SetStateAction<ExtractedRecipeData | null>>;
  categories: CategoryItem[];
  isCreatingCategory: boolean;
  setIsCreatingCategory: (v: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  handleCreateNewCategory: () => void;
  setIsCategoryManagerOpen: (v: boolean) => void;
  handleSaveRecipe: () => void;
  isSaving: boolean;
  showToast: (msg: string) => void;
}

export const RecipeEditorPanel: React.FC<RecipeEditorPanelProps> = ({
  extractedRecipe,
  setExtractedRecipe,
  categories,
  isCreatingCategory,
  setIsCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  handleCreateNewCategory,
  setIsCategoryManagerOpen,
  handleSaveRecipe,
  isSaving,
  showToast,
}) => {
  return (
    <div className="p-5 rounded-3xl bg-slate-50 border border-indigo-100 space-y-4 animate-fade-in shadow-inner dark:bg-white/5">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/10">
        <span className="text-xs font-bold text-indigo-900 flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-indigo-600" />
          架构推理结果与配方配置 (可直接在线修改)
        </span>
        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          ✓ 推理成功
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 风格名称 */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">品类架构名称：</label>
          <input
            type="text"
            value={extractedRecipe.name}
            onChange={e => setExtractedRecipe({ ...extractedRecipe, name: e.target.value })}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]"
          />
        </div>

        {/* 归属品类 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">归属行业品类：</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-0.5 cursor-pointer hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingCategory ? '选择已有品类' : '+ 新建品类'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCategoryManagerOpen(true)}
                className="text-[10px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-0.5 cursor-pointer hover:underline dark:text-slate-400"
                title="管理与删除品类（可删除内置或自定义分类）"
              >
                <Trash2 className="w-3 h-3" />
                <span>管理/删除分类</span>
              </button>
            </div>
          </div>

          {isCreatingCategory ? (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="如：⛺ 户外露营 / 运动装备"
                className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-indigo-300 text-xs font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs dark:text-slate-100 dark:bg-[#18191c]"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateNewCategory}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex-shrink-0"
              >
                确认创建
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingCategory(false)}
                className="px-2 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-medium cursor-pointer dark:text-slate-300 dark:bg-white/10"
              >
                取消
              </button>
            </div>
          ) : (
            <select
              value={extractedRecipe.category}
              onChange={e => {
                if (e.target.value === '__NEW__') {
                  setIsCreatingCategory(true);
                } else if (e.target.value === '__MANAGE__') {
                  setIsCategoryManagerOpen(true);
                } else {
                  setExtractedRecipe({ ...extractedRecipe, category: e.target.value });
                }
              }}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 cursor-pointer dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__NEW__">➕ 自定义新建品类...</option>
              <option value="__MANAGE__">⚙️ 管理 / 删除已有品类...</option>
            </select>
          )}
        </div>
      </div>

      {/* 特征标签 */}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">场景特色标签：</label>
        <input
          type="text"
          value={extractedRecipe.tag}
          onChange={e => setExtractedRecipe({ ...extractedRecipe, tag: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 outline-none focus:border-indigo-500 dark:text-slate-200 dark:border-white/10 dark:bg-[#18191c]"
        />
      </div>

      {/* 🌟 核心理念看板：通用提示词元架构体系 (Prompt Meta-Architecture) */}
      <div className="p-4.5 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-pink-50/30 border border-indigo-100/80 space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-indigo-100/60">
          <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            已提炼【品类专属提示词生成架构体系】（指导 AI 规划全新分镜，拒绝千篇一律）
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
              品类架构就绪
            </span>
          </div>
        </div>

        {/* 架构核心理念说明 */}
        <div className="p-2.5 rounded-xl bg-white/90 border border-indigo-100 text-[11px] text-slate-700 leading-relaxed space-y-1 shadow-2xs dark:text-slate-200 dark:bg-[#18191c]/95">
          <p className="font-bold text-indigo-900 flex items-center gap-1">
            <span>💡 架构如何指导后续分镜规划？</span>
          </p>
          <p className="text-[10px] text-slate-600 dark:text-slate-300">
            架构推理产出的是针对该特定品类的<b>「提示词构建方法论与置景光影法则」</b>。后续在工坊中载入该品类的任意新商品实物图后，大模型将严格依据此套架构指南，为新商品规划出场景、机位、氛围各不相同的高质量分镜提示词！
          </p>
        </div>

        {/* 结构化构建步骤展示 */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1 dark:text-slate-200">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Prompt 构建层级逻辑与拆解顺序：</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {extractedRecipe.architecture?.structure_steps && Array.isArray(extractedRecipe.architecture.structure_steps) ? (
              extractedRecipe.architecture.structure_steps.map((step: any, sIdx: number) => (
                <div key={sIdx} className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-xs">
                    <span className="w-4 h-4 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-[10px]">
                      {step.step_no || sIdx + 1}
                    </span>
                    <span>[{step.title}]</span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed pl-5 dark:text-slate-300">
                    {step.rule}
                  </p>
                </div>
              ))
            ) : (
              <>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                  <span className="font-bold text-indigo-900 text-xs">1. [主体物理特征与材质工艺]</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">提取目标商品真实三维物理特征与微观材质（保留原装装甲结构/版型材质不变）</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                  <span className="font-bold text-indigo-900 text-xs">2. [核心配件/服饰细节]</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">描写 [颜色 + 材质工艺 + 版型/装配关系]，与主体形成协调呼应</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                  <span className="font-bold text-indigo-900 text-xs">3. [周边生态/道具搭配]</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">自然点缀生活化/专业化道具生态池与摆放细节</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                  <span className="font-bold text-indigo-900 text-xs">4. [场景空间与物理背景]</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">真实物理场景环境与背景质感，严禁非现实或脏乱杂物</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-0.5 shadow-2xs sm:col-span-2 dark:border-white/10 dark:bg-[#18191c]">
                  <span className="font-bold text-indigo-900 text-xs">5. [光影色彩与光学质感]</span>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300">模拟真实手机后置主摄买家秀实拍，浅景深虚化、物理接触阴影与自然微噪点</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 输出拼接范式 */}
        {extractedRecipe.architecture?.prompt_formula && (
          <div className="p-2.5 rounded-xl bg-white border border-indigo-100 flex items-center justify-between gap-2 shadow-2xs dark:bg-[#18191c]">
            <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap dark:text-slate-300">最终 Prompt 格式范式：</span>
            <code className="text-[10px] font-mono text-indigo-800 bg-indigo-50/70 px-2 py-1 rounded-lg border border-indigo-200/60 truncate flex-1">
              {extractedRecipe.architecture.prompt_formula}
            </code>
          </div>
        )}
      </div>

      {/* 核心提示词元架构指南 (可按需直接在线编辑) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 dark:text-slate-200">
            <span>提示词元架构系统指令 (Prompt Architecture Blueprint · 可自由编辑与调整)：</span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">将直接作为 System Instruction 指导大模型生成分镜</span>
        </div>
        <textarea
          value={extractedRecipe.promptSnippet}
          onChange={e => setExtractedRecipe({ ...extractedRecipe, promptSnippet: e.target.value })}
          rows={6}
          className="soft-textarea w-full p-3 text-xs leading-relaxed text-slate-800 font-mono resize-y custom-scrollbar dark:text-slate-100"
        />

        {/* 快捷微调增强标签 */}
        <div className="flex flex-wrap gap-1.5 text-[10px] pt-0.5">
          <button
            type="button"
            onClick={() => {
              const snippet = extractedRecipe.promptSnippet;
              const addition = '\n- 模拟 iPhone 16 Pro 后置主摄实拍直出画质，自然浅景深，真实微弱镜头噪点，无过度锐化与廉价塑料感，具有物理接触阴影。';
              if (!snippet.includes('iPhone 16 Pro')) {
                setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                showToast('✨ 已强化【真实手机买家秀质感】！');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium transition-colors cursor-pointer border border-emerald-100 flex items-center gap-1"
          >
            <span>+ 真实手机实拍感</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const snippet = extractedRecipe.promptSnippet;
              const addition = '\n- 环境光线采用柔和自然漫射天光，高光通透温润，暗部层次分明，呈现极佳生活温度。';
              if (!snippet.includes('自然漫射天光')) {
                setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                showToast('✨ 已追加【自然漫射光影】！');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors cursor-pointer border border-amber-100 flex items-center gap-1"
          >
            <span>+ 自然漫射光影</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const snippet = extractedRecipe.promptSnippet;
              const addition = '\n- 主体必须受到真实物理重力承托，稳固放置在场景台面或自然手持，严禁反重力悬浮或物理畸变。';
              if (!snippet.includes('物理重力承托')) {
                setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                showToast('✨ 已注入【物理重力承托规范】！');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition-colors cursor-pointer border border-indigo-100 flex items-center gap-1"
          >
            <span>+ 物理重力承托规范</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const snippet = extractedRecipe.promptSnippet;
              const addition = '\n- 严禁出现任何非现实的奇幻背景或脏乱杂物（如梯子、垃圾桶、凌乱线头），保持背景干净有质感。';
              if (!snippet.includes('严禁出现任何非现实')) {
                setExtractedRecipe({ ...extractedRecipe, promptSnippet: snippet + addition });
                showToast('✨ 已追加【背景纯净去杂物负向约束】！');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors cursor-pointer border border-purple-100 flex items-center gap-1"
          >
            <span>+ 背景去杂物负向约束</span>
          </button>
        </div>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSaveRecipe}
        disabled={isSaving}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-98"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        <span>保存此提示词元架构并立即应用 ➔</span>
      </button>
    </div>
  );
};
