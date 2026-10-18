import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { compressImageToDataUrl } from '@client/shared/media/image-utils';
import { FieldHint, SkillModelSelect } from './SkillMetadataControls';
import {
  type SkillDraftData,
  type SkillOutputGenre,
  SKILL_GENRES,
  SKILL_TAG_OPTIONS,
} from '../model/skillTypes';

export interface SkillMetadataFormProps {
  draft: SkillDraftData;
  onChange: (updated: SkillDraftData) => void;
  onSaveAndUse: () => void;
  showToast: (msg: string) => void;
}

export function SkillMetadataForm({
  draft,
  onChange,
  onSaveAndUse,
  showToast,
}: SkillMetadataFormProps) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const showcaseInputRef = useRef<HTMLInputElement>(null);
  const { videoModels, imageModels } = usePreferenceModels();

  const toggleGenre = (genre: SkillOutputGenre) => {
    const prev = draft.genres;
    const next = prev.includes(genre)
      ? prev.length === 1
        ? prev
        : prev.filter((g) => g !== genre)
      : [...prev, genre];
    onChange({ ...draft, genres: next });
  };

  const toggleTag = (tag: string) => {
    const prev = draft.tags;
    if (prev.includes(tag)) {
      onChange({ ...draft, tags: prev.filter((t) => t !== tag) });
      return;
    }
    if (prev.length >= 3) {
      showToast('最多只能选择 3 个类型标签');
      return;
    }
    onChange({ ...draft, tags: [...prev, tag] });
  };

  const readCompressedImage = async (file: File, maxDimension: number) => {
    if (!file.type.startsWith('image/')) {
      showToast('这里只支持图片');
      return '';
    }
    const url = await compressImageToDataUrl(file, maxDimension, 0.85);
    if (!url) showToast('图片读取失败');
    return url;
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await readCompressedImage(file, 960);
    if (!url) return;
    onChange({ ...draft, coverUrl: url });
    showToast('已加载技能封面');
  };

  const handleShowcaseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (draft.showcaseUrls.length >= 4) {
      showToast('最多上传 4 张成果示意图');
      return;
    }
    const url = await readCompressedImage(file, 640);
    if (!url) return;
    onChange({ ...draft, showcaseUrls: [...draft.showcaseUrls, url] });
    showToast('已添加成果展示图');
  };

  return (
    <section className="flex w-full max-w-[420px] shrink-0 flex-col overflow-hidden bg-white dark:bg-[#18181B]">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 技能名称 * (0/20) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              技能名称 <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {draft.title.length} / 20
            </span>
          </div>
          <input
            type="text"
            maxLength={20}
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder="给你的技能起个名字"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-black/20 focus:outline-none"
          />
        </div>

        {/* 一句话介绍 * (0/50) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              一句话介绍 <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {draft.description.length} / 50
            </span>
          </div>
          <textarea
            rows={2}
            maxLength={50}
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="简短描述技能能做什么"
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-black/20 focus:outline-none"
          />
        </div>

        {/* 输出体裁 * */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
            输出体裁 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SKILL_GENRES.map((g) => {
              const isSelected = draft.genres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGenre(g)}
                  className={`flex h-8 items-center justify-center rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 dark:bg-white font-semibold text-white dark:text-slate-900 shadow-xs'
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* 选择符合这个技能的类型标签 (0/3) * */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              选择符合这个技能的类型标签
            </label>
            <span className="text-[11px] text-slate-400">({draft.tags.length}/3)</span>
            <span className="text-red-500">*</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SKILL_TAG_OPTIONS.map((tag) => {
              const isSelected = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 dark:bg-white font-medium text-white dark:text-slate-900'
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <SkillModelSelect
          label="默认视频模型"
          hint="使用这个技能生成视频时优先调用的模型，留空则由系统自适应"
          value={draft.defaultVideoModel}
          models={videoModels}
          onChange={(defaultVideoModel) => onChange({ ...draft, defaultVideoModel })}
        />
        <SkillModelSelect
          label="默认图片模型"
          hint="使用这个技能生成图片时优先调用的模型，留空则由系统自适应"
          value={draft.defaultImageModel}
          models={imageModels}
          onChange={(defaultImageModel) => onChange({ ...draft, defaultImageModel })}
        />

        {/* 技能封面 (建议比例16:9) * */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
            技能封面（建议比例16:9） <span className="text-red-500">*</span>
          </label>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            className="hidden"
          />
          <div
            onClick={() => coverInputRef.current?.click()}
            className="group relative flex h-24 w-40 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/15 bg-slate-50/50 dark:bg-white/[0.02] hover:border-slate-400 dark:hover:border-white/30 transition-all cursor-pointer"
          >
            {draft.coverUrl ? (
              <img src={draft.coverUrl} alt="封面预览" className="h-full w-full object-cover" />
            ) : (
              <Plus className="h-5 w-5 text-slate-400 group-hover:scale-110 transition-transform" />
            )}
          </div>
        </div>

        {/* 更多成果示意图或视频 (建议比例16:9) */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            更多成果示意图或视频（建议比例16:9）
          </label>
          <input
            ref={showcaseInputRef}
            type="file"
            accept="image/*"
            onChange={handleShowcaseUpload}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            {draft.showcaseUrls.map((url, i) => (
              <div
                key={`${url.slice(0, 32)}-${i}`}
                className="relative h-20 w-32 overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
              >
                <img src={url} alt={`成果 ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`删除成果 ${i + 1}`}
                  onClick={() => onChange({ ...draft, showcaseUrls: draft.showcaseUrls.filter((_, index) => index !== i) })}
                  className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div
              onClick={() => showcaseInputRef.current?.click()}
              className="group flex h-20 w-32 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/15 bg-slate-50/50 dark:bg-white/[0.02] hover:border-slate-400 dark:hover:border-white/30 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 text-slate-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
        </div>

        {/* 提示词指引 ℹ️ (图8) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                提示词指引
              </label>
              <FieldHint text="简要说明填写什么提示词可以让技能发挥得更好" />
            </div>
            <span className="text-[11px] text-slate-400">
              {draft.promptGuide.length} / 50
            </span>
          </div>
          <input
            type="text"
            maxLength={50}
            value={draft.promptGuide}
            onChange={(e) => onChange({ ...draft, promptGuide: e.target.value })}
            placeholder="简要描述填写什么提示词可以让你的技能发挥得更好"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-black/20 focus:outline-none"
          />
        </div>

        {/* 素材上传指引 ℹ️ (图8) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                素材上传指引
              </label>
              <FieldHint text="使用这个技能时建议上传的素材" />
            </div>
            <span className="text-[11px] text-slate-400">
              {draft.assetGuide.length} / 12
            </span>
          </div>
          <input
            type="text"
            maxLength={12}
            value={draft.assetGuide}
            onChange={(e) => onChange({ ...draft, assetGuide: e.target.value })}
            placeholder="使用这个技能时建议上传的素材"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-black/20 focus:outline-none"
          />
        </div>
      </div>

      {/* 底部操作条 (对齐图3/8) */}
      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-black/[0.06] dark:border-white/[0.08] px-6">
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.isPublic}
            onChange={(e) => onChange({ ...draft, isPublic: e.target.checked })}
            className="h-4 w-4 rounded-full border-slate-300 text-black focus:ring-0 cursor-pointer"
          />
          <span>允许官方公开我的技能</span>
        </label>

        <button
          type="button"
          onClick={onSaveAndUse}
          className="flex h-9 items-center rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 px-6 text-xs font-semibold text-white dark:text-slate-900 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          保存并使用
        </button>
      </footer>
    </section>
  );
}
