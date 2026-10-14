import { createAssistantBrandKit } from '../model/assistantBrandKitDefaults';
import BrandKitEditor from './BrandKitEditor';
import { useAssistantDialog } from './useAssistantDialog';
import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Building2,
  User,
  Palette,
  ShieldAlert,
  Edit3,
  RotateCcw
} from 'lucide-react';
import { BrandKitProfile, DEFAULT_BRAND_KITS } from '@shared/domain/products/brandKitModels';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function BrandKitModal({ isOpen, onClose, showToast }: Props) {
  const dialogRef = useAssistantDialog(isOpen, onClose);
  const {
    brandKits,
    activeBrandKitId,
    setActiveBrandKitId,
    addBrandKit,
    updateBrandKit,
    deleteBrandKit
  } = useAppStore(
    useShallow((s) => ({
      brandKits: s.brandKits,
      activeBrandKitId: s.activeBrandKitId,
      setActiveBrandKitId: s.setActiveBrandKitId,
      addBrandKit: s.addBrandKit,
      updateBrandKit: s.updateBrandKit,
      deleteBrandKit: s.deleteBrandKit,
    })),
  );

  const [selectedKitId, setSelectedKitId] = useState<string>(activeBrandKitId || brandKits[0]?.id || '');
  const [isEditing, setIsEditing] = useState(false);

  // 编辑表单状态
  const activeKit = brandKits.find(k => k.id === selectedKitId) || brandKits[0];

  const [formData, setFormData] = useState<BrandKitProfile>(
    activeKit || {
      id: `brand-custom-${Date.now()}`,
      name: '我的新品牌',
      badge: '自定义',
      brandTone: '现代极简，高端质感，自然光影',
      colors: { primary: '#0F172A', primaryName: '科技黑', secondary: '#F8FAFC', secondaryName: '冷白' },
      modelDna: {
        gender: 'female',
        ageGroup: '25岁东亚青年',
        ethnicity: '清秀自然东亚面孔',
        hairStyle: '黑色及肩锁骨微卷发',
        makeupAndOutfit: '自然清透裸妆，极简西装内搭纯白T恤'
      },
      preferredScenes: ['现代极简书房', '原木风工作台'],
      negativeRules: ['严禁塑料反光感', '严禁假人假脸']
    }
  );

  if (!isOpen) return null;

  const handleSelectKit = (kit: BrandKitProfile) => {
    setSelectedKitId(kit.id);
    setFormData(kit);
    setIsEditing(false);
  };

  const handleActivate = (id: string) => {
    setActiveBrandKitId(id);
    const target = brandKits.find(k => k.id === id);
    showToast(`✨ 已激活品牌资产库: 【${target?.name || '默认'}】`);
  };

  const handleDeactivate = () => {
    setActiveBrandKitId(null);
    showToast('已切换为纯净无品牌限制模式');
  };

  const handleCreateNew = () => {
    const newKit = createAssistantBrandKit(brandKits.length);
    addBrandKit(newKit);
    setSelectedKitId(newKit.id);
    setFormData(newKit);
    setIsEditing(true);
    showToast('已创建新品牌资产，可直接编辑细节！');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('请输入品牌资产名称');
      return;
    }
    updateBrandKit(formData.id, formData);
    setIsEditing(false);
    showToast(`💾 已保存品牌资产: 【${formData.name}】`);
  };

  const handleDelete = (id: string, name: string) => {
    if (brandKits.length <= 1) {
      showToast('至少保留一组品牌资产！');
      return;
    }
    if (confirm(`确定删除品牌资产【${name}】吗？`)) {
      deleteBrandKit(id);
      const remaining = brandKits.filter(k => k.id !== id);
      if (remaining[0]) {
        setSelectedKitId(remaining[0].id);
        setFormData(remaining[0]);
      }
      showToast('已删除品牌资产');
    }
  };

  const handleResetDefaults = () => {
    if (confirm('是否恢复官方预设品牌资产模版库？')) {
      DEFAULT_BRAND_KITS.forEach(k => {
        if (!brandKits.some(b => b.id === k.id)) {
          addBrandKit(k);
        }
      });
      showToast('已重置并同步官方预设资产库');
    }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="品牌档案" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* 顶部 Header */}
        <div className="flex shrink-0 items-center justify-between gap-5 border-b border-slate-100 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100">
              <Building2 className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">品牌资产管理</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">统一管理品牌视觉资产与专属模特记忆。</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* 左侧：品牌列表 */}
          <div className="w-64 border-r border-slate-100 bg-slate-50/40 p-3 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>品牌列表 ({brandKits.length})</span>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="flex items-center gap-0.5 text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建
                </button>
              </div>

              {brandKits.map(kit => {
                const isSelected = kit.id === selectedKitId;
                const isActive = kit.id === activeBrandKitId;

                return (
                  <div
                    key={kit.id}
                    onClick={() => handleSelectKit(kit)}
                    className={`group relative p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-white border-red-300 shadow-sm ring-2 ring-red-500/10'
                        : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                        {kit.name}
                      </span>
                      {kit.badge && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          {kit.badge}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                      {kit.brandTone || '未设定调性'}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100/80">
                      {isActive ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <Check className="w-3 h-3 stroke-[3]" /> 当前已激活
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivate(kit.id);
                          }}
                          className="text-[10px] text-slate-500 hover:text-red-600 font-medium cursor-pointer"
                        >
                          设为激活
                        </button>
                      )}

                      {!kit.isDefault && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(kit.id, kit.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity cursor-pointer"
                          title="删除此品牌资产"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 恢复官方预设模版
              </button>
            </div>
          </div>

          {/* 右侧：品牌详情与编辑表单 */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {activeKit ? (
              isEditing ? (
                /* 编辑表单 */
                <BrandKitEditor formData={formData} setFormData={setFormData} onSave={handleSaveForm} onCancel={() => setIsEditing(false)} />
              ) : (
                /* 详情展示看板 */
                <div className="space-y-6">
                  <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-slate-900">{activeKit.name}</h3>
                        {activeKit.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {activeKit.badge}
                          </span>
                        )}
                        {activeKit.id === activeBrandKitId && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> 正在应用
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {activeKit.description || '自定义品牌资产配置'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(activeKit);
                          setIsEditing(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> 编辑资产
                      </button>
                      {activeKit.id === activeBrandKitId ? (
                        <button
                          type="button"
                          onClick={handleDeactivate}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          取消激活
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivate(activeKit.id)}
                          className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                        >
                          ⚡ 立即激活此品牌
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 1. 品牌视觉基调 */}
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100">
                    <h5 className="text-xs font-bold text-amber-900 mb-1.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" /> 品牌整体视觉基调 (Brand Tone)
                    </h5>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {activeKit.brandTone}
                    </p>
                  </div>

                  {/* 2. 品牌色彩系统 */}
                  {activeKit.colors && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <h5 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-indigo-500" /> 品牌色彩体系
                      </h5>
                      <div className="flex items-center gap-4">
                        {activeKit.colors.primary && (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-lg border border-slate-300 shadow-2xs"
                              style={{ backgroundColor: activeKit.colors.primary }}
                            />
                            <div className="text-[11px]">
                              <span className="font-semibold text-slate-800">{activeKit.colors.primaryName || '主色'}</span>
                              <span className="text-slate-400 ml-1">({activeKit.colors.primary})</span>
                            </div>
                          </div>
                        )}
                        {activeKit.colors.secondary && (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-lg border border-slate-300 shadow-2xs"
                              style={{ backgroundColor: activeKit.colors.secondary }}
                            />
                            <div className="text-[11px]">
                              <span className="font-semibold text-slate-800">{activeKit.colors.secondaryName || '辅色'}</span>
                              <span className="text-slate-400 ml-1">({activeKit.colors.secondary})</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. 专属模特 DNA */}
                  {activeKit.modelDna && (
                    <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100/80">
                      <h5 className="text-xs font-bold text-indigo-950 mb-3 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-600" /> 专属虚拟模特 DNA（套图自动保持一致）
                      </h5>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                        <div>
                          <span className="text-slate-400">群体/年龄：</span>
                          <span className="font-semibold text-slate-800">{activeKit.modelDna.ageGroup}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">面容特征：</span>
                          <span className="font-semibold text-slate-800">{activeKit.modelDna.ethnicity}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">发型发色：</span>
                          <span className="font-semibold text-slate-800">{activeKit.modelDna.hairStyle}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">妆容穿搭：</span>
                          <span className="font-semibold text-slate-800">{activeKit.modelDna.makeupAndOutfit}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. 全局避坑规约 */}
                  {activeKit.negativeRules && activeKit.negativeRules.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> 全局负向避坑词
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {activeKit.negativeRules.map((rule, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100 text-[11px] font-medium"
                          >
                            🚫 {rule}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : null}
          </div>
        </div>

        {/* 底部 Footer 说明 */}
        <div className="h-12 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <span>💡 激活的品牌资产将在 AI 撰写提示词、文案与多图生成时作为全局强记忆注入。</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
}
