import { useState } from 'react';
import { Eye, ImagePlus, Plus, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { resolveSkillKind } from '@shared/domain/assistant/skills/skillPurpose';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { CreationSkillDetailModal } from '@client/shared/skills/components/CreationSkillDetailModal';
import {
  applyCreationSkillOverridesToPrompt,
  resolveCreationSkillModifiableSummary,
} from '@client/shared/skills/model/creationSkillModifiers';
import { librarySkillItem } from '@client/shared/skills/model/libraryView';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

interface AssetSlotProps {
  skill: AssistantSkill;
  onUploadClick: () => void;
}

/**
 * 对应图4：当选用创作技能且尚未上传参考图时，在输入框左侧呈现的虚线参考垫图槽位卡片。
 */
export function PromptBarSkillAssetSlot({ skill, onUploadClick }: AssetSlotProps) {
  const modifiable = resolveCreationSkillModifiableSummary(skill);
  const coverUrl = skill.meta?.coverUrl || skill.meta?.showcaseUrls?.[0];

  return (
    <button
      type="button"
      onClick={onUploadClick}
      title={`点击上传参考垫图（${modifiable.uploadSlotLabel}）`}
      className="group/skill-slot relative mr-3 flex h-[96px] w-[118px] shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300/90 bg-[#F4F5F7]/90 px-2 py-2.5 transition-all hover:border-slate-400 hover:bg-[#EAECEF] sm:h-[100px] sm:w-[126px] dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-white/25 dark:hover:bg-white/[0.08]"
    >
      <div className="relative flex h-11 w-16 items-center justify-center">
        {/* 左倾黑白剪影示意卡 */}
        <div
          aria-hidden="true"
          className="relative z-10 h-9 w-9 -translate-x-1.5 -rotate-[8deg] overflow-hidden rounded-lg border-2 border-white bg-gradient-to-br from-slate-100 via-slate-300 to-slate-800 shadow-sm transition-transform duration-300 group-hover/skill-slot:-translate-x-2 group-hover/skill-slot:-rotate-[12deg] dark:border-white/20"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-3.5 w-5 -rotate-12 rounded-full bg-slate-900/80 blur-[0.5px]" />
          </div>
        </div>

        {/* 右倾暖调/封面示意卡 */}
        <div
          aria-hidden="true"
          className="relative z-0 h-9 w-9 translate-x-1.5 rotate-[8deg] overflow-hidden rounded-lg border-2 border-white bg-gradient-to-br from-[#2a1818] via-[#8b2626] to-[#d97706] shadow-sm transition-transform duration-300 group-hover/skill-slot:translate-x-2 group-hover/skill-slot:rotate-[12deg] dark:border-white/20"
        >
          {coverUrl && (
            <img
              src={proxyMediaUrl(coverUrl)}
              alt=""
              className="h-full w-full object-cover opacity-90"
            />
          )}
        </div>

        {/* 右上角 + 圆形角标 */}
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200/95 text-slate-700 shadow-2xs transition-transform group-hover/skill-slot:scale-110 group-hover/skill-slot:bg-slate-900 group-hover/skill-slot:text-white dark:bg-white/20 dark:text-white dark:group-hover/skill-slot:bg-white dark:group-hover/skill-slot:text-slate-900"
        >
          <Plus size={12} strokeWidth={2.4} />
        </span>
      </div>

      <span className="w-full truncate text-center text-[11px] font-medium tracking-tight text-slate-700 dark:text-slate-200">
        {modifiable.uploadSlotLabel}
      </span>
    </button>
  );
}

interface CustomizeBarProps {
  skill: AssistantSkill | null;
  quickPrompt: string;
  setQuickPrompt: (next: string) => void;
  refImagesCount: number;
  onUploadClick: () => void;
  onClearSkill: () => void;
  showToast: (msg: string) => void;
}

/**
 * 当激活创作技能时，在创作栏顶部呈现的可修改项交互面板。
 */
export function PromptBarSkillCustomizeBar({
  skill,
  quickPrompt,
  setQuickPrompt,
  refImagesCount,
  onUploadClick,
  onClearSkill,
  showToast,
}: CustomizeBarProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [detailOpen, setDetailOpen] = useState(false);

  if (!skill || resolveSkillKind(skill) !== 'creation') return null;

  const title = skill.displayName || skill.name;
  const modifiable = resolveCreationSkillModifiableSummary(skill);
  const modelLabel =
    [skill.meta?.defaultVideoModel, skill.meta?.defaultImageModel].filter(Boolean).join(' · ') ||
    'SD 2.5';
  const hasAnyOverride = Object.entries(overrides).some(([key, value]) => {
    const slot = modifiable.slots.find((item) => item.id === key);
    return Boolean(value.trim() && value.trim() !== slot?.defaultValue);
  });

  const applyOverrideChange = (slotId: string, value: string) => {
    const nextOverrides = { ...overrides, [slotId]: value };
    setOverrides(nextOverrides);
    const updatedPrompt = applyCreationSkillOverridesToPrompt(
      quickPrompt,
      title,
      nextOverrides,
      modifiable.slots,
    );
    setQuickPrompt(updatedPrompt);
  };

  const resetAllOverrides = () => {
    setOverrides({});
    const resetPrompt = applyCreationSkillOverridesToPrompt(
      quickPrompt,
      title,
      {},
      modifiable.slots,
    );
    setQuickPrompt(resetPrompt);
    showToast('已恢复技能默认参数');
  };

  const skillItem = librarySkillItem({ kind: 'assistant', content: skill });

  return (
    <div
      data-creation-skill-customize-bar
      className="rounded-2xl border border-slate-200/80 bg-slate-50/85 px-3.5 py-2.5 text-xs transition-all dark:border-white/10 dark:bg-white/[0.03]"
    >
      {/* 顶部标题与操作行 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">
            <Sparkles size={11} />
            <span>创作技能</span>
          </span>
          <span className="truncate font-semibold text-slate-900 dark:text-white">{title}</span>
          <span className="hidden rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 sm:inline-block dark:bg-white/10 dark:text-slate-300">
            {modelLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUploadClick}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ImagePlus size={12} />
            <span>
              {refImagesCount > 0 ? `已传垫图(${refImagesCount})` : modifiable.uploadSlotLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Eye size={12} />
            <span>查看脚本</span>
          </button>

          {hasAnyOverride && (
            <button
              type="button"
              onClick={resetAllOverrides}
              title="恢复默认设定"
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10"
            >
              <RotateCcw size={11} />
              <span>默认</span>
            </button>
          )}

          <button
            type="button"
            aria-label={`移除创作技能 ${title}`}
            onClick={onClearSkill}
            title="取消使用该创作技能"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 可修改项槽位速改区 */}
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {modifiable.slots.map((slot) => {
          const currentVal = overrides[slot.id] ?? '';
          const isModified = Boolean(currentVal.trim() && currentVal.trim() !== slot.defaultValue);
          return (
            <div
              key={slot.id}
              title={slot.hint}
              className={`flex flex-col justify-center rounded-xl border px-2.5 py-1.5 transition ${
                isModified
                  ? 'border-blue-500/40 bg-blue-50/40 dark:border-blue-400/30 dark:bg-blue-500/10'
                  : 'border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#1E2027]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                  <SlidersHorizontal size={10} />
                  {slot.label}
                </span>
                {isModified ? (
                  <span className="font-semibold text-blue-600 dark:text-blue-400">已注入强指令</span>
                ) : (
                  slot.defaultValue && (
                    <span className="truncate max-w-[110px]">默认：{slot.defaultValue}</span>
                  )
                )}
              </div>

              {slot.kind === 'select' && slot.options ? (
                <select
                  aria-label={slot.label}
                  value={currentVal || slot.defaultValue}
                  onChange={(e) => applyOverrideChange(slot.id, e.target.value)}
                  className="mt-0.5 w-full cursor-pointer truncate bg-transparent text-xs font-medium text-slate-800 outline-none dark:text-slate-100"
                >
                  {slot.options.map((opt) => (
                    <option key={opt} value={opt} className="bg-white text-slate-900 dark:bg-[#1E2027] dark:text-white">
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  aria-label={slot.label}
                  value={currentVal}
                  onChange={(e) => applyOverrideChange(slot.id, e.target.value)}
                  placeholder={slot.placeholder}
                  className="mt-0.5 w-full bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                />
              )}
            </div>
          );
        })}
      </div>

      {detailOpen && (
        <CreationSkillDetailModal
          item={skillItem}
          isFavorite={Boolean(skill.isFavorite)}
          onClose={() => setDetailOpen(false)}
          onUse={(initialPrompt) => {
            if (initialPrompt) setQuickPrompt(initialPrompt);
            setDetailOpen(false);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
