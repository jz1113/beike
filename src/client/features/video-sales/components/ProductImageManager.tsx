import { useRef, useState } from 'react';
import { Upload, Sparkles, Trash2 } from 'lucide-react';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';

interface Props {
  productImages: string[];
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onUpdateImages: (images: string[]) => void;
}

export function ProductImageManager({
  productImages,
  isAnalyzing,
  onAnalyze,
  onUpdateImages,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newImageUrl, setNewImageUrl] = useState('');

  const handleAddImage = (url: string) => {
    if (!url.trim()) return;
    onUpdateImages([...productImages, url.trim()]);
    setNewImageUrl('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateImages([...productImages, reader.result]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    onUpdateImages(productImages.filter((_, i) => i !== index));
  };

  return (
    <SpotlightCard className="p-5 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[14px] font-semibold text-slate-800 dark:text-[#EDEDED] flex items-center gap-2">
          <Upload className="w-4 h-4 text-indigo-500" />
          商品参考图 ({productImages.length}/5)
        </span>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing || productImages.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 transition-colors disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? '分析中...' : 'AI 视觉分析'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {productImages.map((url, idx) => (
          <div key={idx} className="group relative aspect-square rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.08] bg-slate-50 dark:bg-[#242428]">
            <img src={url} alt={`商品图 ${idx + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemoveImage(idx)}
              className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {productImages.length < 5 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-slate-600 hover:border-slate-400 dark:hover:text-slate-200 transition-colors bg-slate-50/50 dark:bg-transparent"
          >
            <Upload className="w-4 h-4" />
            <span className="text-[11px]">上传实拍</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {productImages.length < 5 && (
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="或粘贴网络图片 URL..."
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddImage(newImageUrl)}
            className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#121214] border border-black/[0.06] dark:border-white/[0.08] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => handleAddImage(newImageUrl)}
            disabled={!newImageUrl.trim()}
            className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40"
          >
            添加
          </button>
        </div>
      )}
    </SpotlightCard>
  );
}
