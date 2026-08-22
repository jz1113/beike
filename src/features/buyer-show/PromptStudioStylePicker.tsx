'use client';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import { useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  FileText,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';

export interface PromptStudioStylePickerProps {
  workshopMode: string;
  customRecipes: any[];
  setCustomRecipes: React.Dispatch<React.SetStateAction<any[]>>;
  selectedStyleId: string;
  setSelectedStyleId: (id: string) => void;
  customStyleText: string;
  setCustomStyleText: (v: string) => void;
  isViewingStyleSnippet: boolean;
  setIsViewingStyleSnippet: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingStyleSnippet: boolean;
  setIsEditingStyleSnippet: React.Dispatch<React.SetStateAction<boolean>>;
  copiedStyleSnippet: boolean;
  setCopiedStyleSnippet: React.Dispatch<React.SetStateAction<boolean>>;
  generatedPromptsLength: number;
  showToast: (msg: string) => void;
  setIsManualArchOpen: (open: boolean) => void;
  setIsExtractModalOpen: (open: boolean) => void;
  setIsRecipeBrowserOpen: (open: boolean) => void;
}

export default function PromptStudioStylePicker({
  workshopMode,
  customRecipes,
  setCustomRecipes,
  selectedStyleId,
  setSelectedStyleId,
  customStyleText,
  setCustomStyleText,
  isViewingStyleSnippet,
  setIsViewingStyleSnippet,
  isEditingStyleSnippet,
  setIsEditingStyleSnippet,
  copiedStyleSnippet,
  setCopiedStyleSnippet,
  generatedPromptsLength,
  showToast,
  setIsManualArchOpen,
  setIsExtractModalOpen,
  setIsRecipeBrowserOpen,
}: PromptStudioStylePickerProps) {
  const [editingRecipeName, setEditingRecipeName] = useState('');
  const [isSavingRecipeName, setIsSavingRecipeName] = useState(false);
  return (
    <>
{/* 3. 品类场景与拍摄架构 (仅在「原创策划工坊」中需要；「爆款换人换品工坊」由社媒图决定场景构图，无需此配方) */}
{workshopMode !== 'social_face_product_swap' && (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs font-bold text-slate-800 flex items-center gap-2 min-w-0">
        <div className="w-5 h-5 rounded-lg bg-pink-50 border border-pink-200/80 text-pink-600 flex items-center justify-center shadow-2xs flex-shrink-0">
          <Sliders className="w-3 h-3" />
        </div>
        <span className="truncate">品类场景与拍摄架构 (Prompt Recipe)</span>
      </label>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setIsManualArchOpen(true)}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
          title="粘贴或上传自有提示词架构"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>粘贴架构</span>
        </button>
        <button
          type="button"
          onClick={() => setIsExtractModalOpen(true)}
          className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
          title="从参考样张/图集进行品类架构推理，生成通用提示词架构"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>+ 架构推理</span>
        </button>
      </div>
    </div>

    {/* 当前生效的拍摄架构卡片 */}
    {(() => {
      const activeStyle = customRecipes.find(r => r.id === selectedStyleId);
      const isCustomActive = Boolean(activeStyle);

      const activeName = isCustomActive ? activeStyle.name : '✨ 自由智能创作 (未绑定固定模板)';
      const activeTag = isCustomActive 
        ? (activeStyle.tag || '用户专属架构推理拍摄架构') 
        : '由视觉大模型全权根据商品实物图自适应构思空间与光影';
      
      const defaultAutoSnippet = '【智能自由创作模式】：大模型依据商品真实材质与调性，自由有机地构思真实空间纵深、高级光影与生活道具，生成独一无二的高质感生活买家秀。';
      const currentActivePromptSnippet = customStyleText || (isCustomActive ? (activeStyle?.promptSnippet || activeStyle?.prompt_snippet || '') : defaultAutoSnippet);

      return (
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs font-bold text-sm ${
                isCustomActive ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
              }`}>
                {isCustomActive ? activeName.replace(/^[✨\s]+/, '').slice(0, 2) : '🎯'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <span>{activeName}</span>
                  {customStyleText && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200 font-bold">
                      已自定义架构
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                  {activeTag}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isCustomActive && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!(await confirmAction(`确定要删除「${activeStyle.name}」配方吗？`))) return;
                    try {
                      const res = await apiFetch(`/api/catalog/styles?id=${selectedStyleId}`, { method: 'DELETE' });
                      const data = await res.json();
                      if (data.success) {
                        setCustomRecipes(prev => prev.filter(r => r.id !== selectedStyleId));
                        setSelectedStyleId('auto');
                      }
                    } catch (err) {
                      console.error('删除配方失败:', err);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer border border-slate-200/60 hover:border-red-200"
                  title="删除当前自定义配方"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsRecipeBrowserOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border border-indigo-200/60"
              >
                <Sliders className="w-3 h-3" />
                <span>{customRecipes.length > 0 ? '更换' : '配方库'}</span>
              </button>
            </div>
          </div>

          {/* 快捷专属配方胶囊 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-thin text-[11px]">
            <button
              type="button"
              onClick={() => {
                if (generatedPromptsLength > 0) {
                  showToast('已切换配方，组级场景锁已清空，请重新分析');
                }
                setSelectedStyleId('auto');
                setCustomStyleText('');
                setIsEditingStyleSnippet(false);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStyleId === 'auto'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🎯 自由智能创作
            </button>
            {customRecipes.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  if (generatedPromptsLength > 0 && selectedStyleId !== r.id) {
                    showToast('已切换配方，组级场景锁已清空，请重新分析');
                  }
                  setSelectedStyleId(r.id);
                  setCustomStyleText('');
                  setIsEditingStyleSnippet(false);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer truncate max-w-[140px] ${
                  selectedStyleId === r.id
                    ? 'bg-pink-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={`品类专属架构: ${r.name}`}
              >
                ✨ {r.name.length > 8 ? r.name.slice(0, 7) + '..' : r.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsManualArchOpen(true)}
              className="px-2 py-1 rounded-lg font-bold whitespace-nowrap text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer flex items-center gap-0.5 border border-indigo-200/60"
            >
              <FileText className="w-3 h-3" />
              <span>粘贴架构</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExtractModalOpen(true)}
              className="px-2 py-1 rounded-lg font-bold whitespace-nowrap text-pink-600 hover:bg-pink-50 transition-all cursor-pointer flex items-center gap-0.5 border border-pink-200/60"
            >
              <Sparkles className="w-3 h-3 text-pink-500" />
              <span>+ 架构推理</span>
            </button>
          </div>

          {/* 🌟 提示词查看与实时修改面板 (透明可见、随时修改、所改即所用) */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsViewingStyleSnippet(prev => !prev)}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isViewingStyleSnippet ? '收起提示词架构' : '👁️ 查看/修改提示词架构'}</span>
                <span className="text-[10px] text-slate-400 font-mono font-normal">
                  ({currentActivePromptSnippet.length} 字符)
                </span>
              </button>

              <div className="flex items-center gap-2">
                {isViewingStyleSnippet && !isEditingStyleSnippet && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!customStyleText) setCustomStyleText(activeStyle?.promptSnippet || '');
                      setEditingRecipeName((activeStyle?.name || '').replace(/^[✨\s]+/, '').trim());
                      setIsEditingStyleSnippet(true);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>修改此提示词</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentActivePromptSnippet);
                    setCopiedStyleSnippet(true);
                    setTimeout(() => setCopiedStyleSnippet(false), 2000);
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                  title="复制当前提示词内容"
                >
                  {copiedStyleSnippet ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedStyleSnippet ? '已复制' : '复制'}</span>
                </button>
              </div>
            </div>

            {/* 展开的提示词查看/修改内容区域 */}
            {isViewingStyleSnippet && (
              <div className="space-y-2 animate-fade-in">
                {isEditingStyleSnippet ? (
                  <div className="space-y-2">
                    {isCustomActive && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">架构名称</label>
                        <input
                          type="text"
                          value={editingRecipeName}
                          onChange={e => setEditingRecipeName(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-indigo-200 text-xs text-slate-800 font-bold outline-none focus:bg-white focus:border-indigo-400"
                          placeholder="例如：我的拍摄架构"
                        />
                      </div>
                    )}
                    <textarea
                      value={customStyleText || activeStyle?.promptSnippet || ''}
                      onChange={e => setCustomStyleText(e.target.value)}
                      rows={6}
                      placeholder="在此粘贴你的完整提示词架构，或点上方「粘贴架构」导入并保存"
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-indigo-300 text-xs text-slate-800 font-mono leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-slate-400">
                        提示：此处修改将直接作为本次 AI 提炼分镜的专属架构
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomStyleText('');
                            setIsEditingStyleSnippet(false);
                          }}
                          className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
                        >
                          重置为默认
                        </button>
                        <button
                          type="button"
                          disabled={isSavingRecipeName}
                          onClick={async () => {
                            if (isCustomActive && activeStyle?.id) {
                              const nextName = editingRecipeName.replace(/^[✨\s]+/, '').trim();
                              if (!nextName) {
                                showToast('请填写架构名称');
                                return;
                              }
                              setIsSavingRecipeName(true);
                              try {
                                const snippet = (customStyleText || activeStyle.promptSnippet || '').trim();
                                await apiFetch('/api/catalog/styles', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    id: activeStyle.id,
                                    name: nextName,
                                    promptSnippet: snippet,
                                  }),
                                });
                                setCustomRecipes(prev => prev.map(r =>
                                  r.id === activeStyle.id
                                    ? { ...r, name: nextName, promptSnippet: snippet }
                                    : r
                                ));
                                showToast('已更新架构名称');
                              } catch (err) {
                                console.error('保存架构名称失败:', err);
                                showToast('保存架构名称失败');
                                return;
                              } finally {
                                setIsSavingRecipeName(false);
                              }
                            }
                            setIsEditingStyleSnippet(false);
                          }}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingRecipeName ? '保存中...' : '完成修改'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                    {currentActivePromptSnippet}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    })()}
  </div>
)}
    </>
  );
}
