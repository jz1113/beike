import { useState } from 'react';
import { X, Plus, Trash2, ShieldAlert } from 'lucide-react';
import type { CoverCorrection, CoverStyleSkill } from '../../model/coverSkillTypes';

interface Props {
  branchKey: string | null;
  activeStyle: CoverStyleSkill;
  corrections: CoverCorrection[];
  onClose: () => void;
  onAddCorrection: (rule: string) => void;
  onDeleteCorrection: (id: string) => void;
}

export function CoverBranchDetailPopover({
  branchKey,
  activeStyle,
  corrections,
  onClose,
  onAddCorrection,
  onDeleteCorrection,
}: Props) {
  const [newRule, setNewRule] = useState('');

  if (!branchKey) return null;

  const f = activeStyle.features;

  const getBranchMeta = () => {
    switch (branchKey) {
      case 'layout':
        return {
          title: '构图与布局基因',
          items: f?.layout ? [
            { label: '构图体系', value: f.layout.gridType },
            { label: '主体占高比例', value: f.layout.subjectAreaRatio },
            { label: '主体锚定方位', value: f.layout.subjectAnchor },
            { label: '留白呼吸率', value: f.layout.whiteSpaceRatio },
            { label: '图文层叠关系', value: f.layout.depthLayering },
          ] : [],
        };
      case 'typography':
        return {
          title: '字体与艺术字基因',
          items: f?.typography ? [
            { label: '字体字重风格', value: f.typography.titleFontFamily },
            { label: '字组排布格式', value: f.typography.titleArrangement },
            { label: '字距控制规律', value: f.typography.letterSpacing },
            { label: '艺术字修饰手法', value: f.typography.artTreatment },
          ] : [],
        };
      case 'color':
        return {
          title: '配色与材质基因',
          items: f?.colorPalette ? [
            { label: '背景基调', value: f.colorPalette.backgroundTone },
            { label: '第一主色', value: f.colorPalette.dominantColor },
            { label: '点睛强调色', value: f.colorPalette.accentColor },
            { label: '对比度层级', value: f.colorPalette.contrastLevel },
            { label: '色彩提取规则', value: f.colorPalette.colorSourceRule },
            { label: '背景质感渲染', value: f?.textureAndLight?.backgroundTexture || '标准噪点' },
            { label: '主光方向与阴影', value: f?.textureAndLight?.lightDirection || '微弱接触阴影' },
          ] : [],
        };
      case 'copywriting':
        return {
          title: '文案与修饰基因',
          items: f?.copywritingStyle ? [
            { label: '文案句式特征', value: f.copywritingStyle.grammar },
            { label: '字数限制区间', value: f.copywritingStyle.wordCountRange },
            { label: '装饰元素体系', value: f?.decorations?.elements?.join(', ') || '极简无修饰' },
          ] : [],
        };
      case 'corrections':
        return {
          title: '负向避坑记忆 (硬性规避)',
          isCorrections: true,
          items: [],
        };
      default:
        return { title: '特征属性', items: [] };
    }
  };

  const meta = getBranchMeta();

  const handleAdd = () => {
    if (!newRule.trim()) return;
    onAddCorrection(newRule.trim());
    setNewRule('');
  };

  return (
    <div className="absolute top-20 left-6 z-30 w-80 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#1A1A1E]/95 p-4 shadow-xl backdrop-blur-xl animate-fade-in text-xs">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-white/5">
        <span className="font-bold text-slate-900 dark:text-white">{meta.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 max-h-60 overflow-y-auto space-y-2">
        {meta.isCorrections ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-bold">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>在此记录的负向规则将永久注入模型强制规避</span>
            </div>

            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="例如: 禁止文字挡镜头/不要感叹号"
                className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                className="rounded-lg bg-indigo-600 px-2.5 py-1.5 font-bold text-white hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {activeStyle.negativeRules.map((rule, idx) => (
                <div key={idx} className="rounded-lg bg-slate-100/70 dark:bg-white/5 p-2 text-slate-700 dark:text-slate-300">
                  • {rule}
                </div>
              ))}
              {corrections.map((corr) => (
                <div key={corr.id} className="flex items-center justify-between rounded-lg bg-rose-50/60 dark:bg-rose-950/20 p-2 text-rose-700 dark:text-rose-300">
                  <span>• {corr.negativeRule}</span>
                  <button
                    type="button"
                    onClick={() => onDeleteCorrection(corr.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          meta.items.map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] p-2">
              <span className="text-[10px] text-slate-400 font-medium">{item.label}</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold">{item.value || '未提取'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
