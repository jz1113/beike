import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { X } from 'lucide-react';
import ModelPicker from '@client/shared/ui/model-picker/ModelPicker';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { useAppStore } from '@client/store';
import { isOpenAIModelRouteId } from '@shared/domain/models/workflowModels';

interface Props {
  titleModel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (imageUrls: string[], model: string, title: string) => void;
}

interface LocalImage {
  id: string;
  name: string;
  preview: string;
  file?: File;
  url?: string;
}

export function CoverMultiImageBatchUploader({ titleModel, busy, onClose, onSubmit }: Props) {
  const assistantModel = useAppStore((state) => state.assistantModel);
  const models = useMemo(() => loadSystemConfiguredModels().availableVisionModels.filter((model) => !isOpenAIModelRouteId(model.id)), []);
  const initial = models.some((model) => model.id === assistantModel) ? assistantModel : models.some((model) => model.id === titleModel) ? titleModel : models[0]?.id || '';
  const [model, setModel] = useState(initial);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [links, setLinks] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = models.find((item) => item.id === model) || { name: model, shortName: model };

  const addFiles = (files: File[]) => {
    const next = files.filter((file) => file.type.startsWith('image/')).slice(0, 10 - images.length).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      preview: URL.createObjectURL(file),
      file,
    }));
    setImages((list) => [...list, ...next].slice(0, 10));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const submit = async () => {
    const urls = links.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('http://') || line.startsWith('https://'));
    const total = images.length + urls.length;
    if (total < 2 || total > 10) {
      setError('请提供 2 到 10 张封面。');
      return;
    }
    if (!model) {
      setError('暂无已启用的模型，请在设置中添加。');
      return;
    }
    setError(null);
    try {
      const uploaded = await Promise.all(images.map(async (image) => image.url || (image.file ? uploadStudioFile(image.file, 'cover-memory') : '')));
      onSubmit([...uploaded.filter(Boolean), ...urls], model, title.trim() || `样张 ${total} 张`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '样张上传失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-[560px] rounded-3xl border border-white/10 bg-[#16161a] p-5 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">投喂封面样张</h3>
            <p className="mt-1 text-[11px] text-slate-400">2 到 10 张同类封面。反推后进入待确认，采纳后才会进入封面技能。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="关闭"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-3">
          {models.length === 0 ? <p className="text-xs text-amber-200">暂无已启用的模型，请在设置中添加。</p> : (
            <ModelPicker
              models={models}
              model={model}
              current={current}
              onModelChange={setModel}
              effort="medium"
              onEffortChange={() => {}}
              open={open}
              onOpenChange={setOpen}
              menuRef={menuRef}
              showEffort={false}
              placement="down"
            />
          )}
        </div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="这组样张叫什么，可选" className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none" />
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center"
        >
          <span className="text-xs font-bold">拖入或选择封面图</span>
          <span className="mt-1 text-[11px] text-slate-400">JPG、PNG、WebP</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        </label>
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-5 gap-2">
            {images.map((image) => (
              <div key={image.id} className="relative">
                <img src={image.preview} alt={image.name} className="h-16 w-full rounded-lg object-cover" />
                <button type="button" className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5" aria-label="移除" onClick={() => setImages((list) => list.filter((item) => item.id !== image.id))}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="mt-3 text-[11px] font-bold text-slate-400" onClick={() => setShowLinks((value) => !value)}>{showLinks ? '收起链接' : '改用图片链接'}</button>
        {showLinks && <textarea value={links} onChange={(event) => setLinks(event.target.value)} rows={3} placeholder="每行一个 https 链接" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-2 text-xs outline-none" />}
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-300">取消</button>
          <button type="button" disabled={busy || !model} onClick={() => { void submit(); }} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">开始反推</button>
        </div>
      </div>
    </div>
  );
}
