import { useState, type ChangeEvent } from 'react';
import { UploadCloud, Layers, Sparkles, X, Loader2 } from 'lucide-react';
import { deconstructQueue } from '../../model/coverDeconstructQueue';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_VISION_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (推荐/极速)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (经济款)' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (视觉细节顶尖)' },
  { id: 'gpt-4o', name: 'GPT-4o (通用视觉分析)' },
];

export function CoverMultiImageBatchUploader({ isOpen, onClose }: Props) {
  const [urlsText, setUrlsText] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.7-flash');
  const [batchTitle, setBatchTitle] = useState('');
  const [isEnqueuing, setIsEnqueuing] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const readers: Promise<string>[] = Array.from(files).map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    setIsEnqueuing(true);
    Promise.all(readers).then((base64Urls) => {
      deconstructQueue.enqueue(base64Urls, selectedModel, batchTitle.trim() || `本地上传 (${base64Urls.length} 张)`);
      setIsEnqueuing(false);
      onClose();
    }).catch(() => {
      setIsEnqueuing(false);
    });
  };

  const handleEnqueueUrls = () => {
    const urls = urlsText
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/'));

    if (urls.length === 0) return;

    deconstructQueue.enqueue(urls, selectedModel, batchTitle.trim() || `在线样张群组 (${urls.length} 张)`);
    setUrlsText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-[580px] flex-col overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1E] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">多图群组对比反推 · 投喂样张</h3>
              <p className="text-[11px] text-slate-400">一次投喂 2~10 张同类封面，大模型自动提炼共性语法与自进化 Skill</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 模型选择 */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              反推视觉多模态大模型
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
            >
              {AVAILABLE_VISION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* 标题备注 */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              样张批次标题/标签（可选）
            </label>
            <input
              type="text"
              value={batchTitle}
              onChange={(e) => setBatchTitle(e.target.value)}
              placeholder="例如: 数码硬核黑金风样张群组..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
            />
          </div>

          {/* 本地批量文件拖入 */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              方式一：选择本地封面图片（可多选）
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 p-5 text-center transition hover:border-indigo-400 bg-slate-50/50 dark:bg-white/[0.02]">
              <UploadCloud className="h-6 w-6 text-indigo-500 mb-1" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">点击多选或拖入封面图</span>
              <span className="text-[10px] text-slate-400 mt-0.5">支持 JPG, PNG, WebP 格式</span>
              <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* 在线多行 URL 粘贴 */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              方式二：粘贴多行封面图片 URL (每行一个链接)
            </label>
            <textarea
              rows={4}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://example.com/cover1.jpg&#10;https://example.com/cover2.jpg&#10;https://example.com/cover3.jpg"
              className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-3 text-xs leading-relaxed text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 p-4 bg-slate-50/50 dark:bg-white/[0.02]">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> 投喂后在后台自动运行并沉淀记忆
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isEnqueuing || !urlsText.trim()}
              onClick={handleEnqueueUrls}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-40"
            >
              {isEnqueuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              加入后台反推队列
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
