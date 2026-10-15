import { useState } from 'react';
import { Music, Upload, X } from 'lucide-react';
import { useI18n } from '@client/shared/i18n';
import {
  addCustomAsset,
  type CustomAssetCategory,
  type CustomAssetItem,
} from '../model/customAssetStore';

interface Props {
  category: CustomAssetCategory;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (item: CustomAssetItem) => void;
}

const CATEGORY_NAMES: Record<CustomAssetCategory, string> = {
  character: '角色',
  product: '商品',
  voice: '音色',
  file: '文件',
};

export default function CreateAssetModal({ category, isOpen, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const categoryName = CATEGORY_NAMES[category];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!name.trim()) {
      setName(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMediaUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsSubmitting(true);
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const created = addCustomAsset({
      category,
      name: trimmedName,
      description: description.trim() || undefined,
      tags: tags.length ? tags : undefined,
      coverUrl: mediaUrl || undefined,
      mediaUrl: mediaUrl || undefined,
    });

    setIsSubmitting(false);
    onSuccess(created);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-base font-bold text-slate-900">
          新增{categoryName}资产
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          添加并定义您的{categoryName}库，方便在生图、生视频和画布中随时调用。
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              {categoryName}名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`如：${category === 'character' ? '小云雀女主' : category === 'product' ? '秋季针织衫' : category === 'voice' ? '温和青年音' : '参考资料.pdf'}`}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              描述与设定
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入外观特征、核心设定或提示词..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              {category === 'voice' ? '上传音频/参考' : category === 'file' ? '上传参考文件' : '上传参考图/封面'}
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all overflow-hidden">
                {mediaUrl ? (
                  category === 'voice' ? (
                    <Music className="h-6 w-6 text-indigo-600" />
                  ) : (
                    <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    <span className="mt-1 text-[10px]">选择文件</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept={
                    category === 'voice'
                      ? 'audio/*'
                      : category === 'file'
                      ? '*/*'
                      : 'image/*'
                  }
                  onChange={handleFileUpload}
                />
              </label>
              <div className="flex-1 text-[11px] text-slate-400">
                支持拖拽或选择本地文件上传，生成或引用时将作为主体基准。
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              标签 (以逗号分隔)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="如：都市, 少女, 休闲"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
