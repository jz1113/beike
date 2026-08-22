'use client';
import { useRef, useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { getMergedCategories } from '@/lib/vision';
import { formatUserError } from '@/lib/upstreamErrors';
import { X, FileText, Upload, Loader2, Save, Play } from 'lucide-react';

export interface ManualArchitectureResult {
  name: string;
  promptSnippet: string;
  category: string;
  tag: string;
  desc: string;
  recipe?: any;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 立即使用（可不保存） */
  onUse: (result: ManualArchitectureResult) => void;
  /** 保存成功后回调（可选） */
  onSaved?: (recipe: any) => void;
  initialSnippet?: string;
  initialName?: string;
}

export default function ManualArchitecturePanel({
  isOpen,
  onClose,
  onUse,
  onSaved,
  initialSnippet = '',
  initialName = '',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('我的自定义拍摄架构');
  const [category, setCategory] = useState('general');
  const [snippet, setSnippet] = useState('');
  const [categories, setCategories] = useState(() => getMergedCategories());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategories(getMergedCategories());
    setSnippet(initialSnippet || '');
    setName(initialName?.trim() || '我的自定义拍摄架构');
    setError(null);
  }, [isOpen, initialSnippet, initialName]);

  if (!isOpen) return null;

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.md')) {
      setError('仅支持 .txt / .md 文本文件');
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        setError('文件内容为空');
        return;
      }
      setSnippet(text);
      if (!name || name === '我的自定义拍摄架构') {
        setName(file.name.replace(/\.(txt|md)$/i, '') || '导入的拍摄架构');
      }
      setError(null);
    } catch {
      setError('读取文件失败');
    }
  };

  const buildResult = (recipe?: any): ManualArchitectureResult => ({
    name: name.trim() || '我的自定义拍摄架构',
    promptSnippet: snippet.trim(),
    category,
    tag: '手动粘贴/导入',
    desc: '用户粘贴或文件导入的提示词架构',
    recipe,
  });

  const handleUseNow = () => {
    if (!snippet.trim()) {
      setError('请先粘贴或导入提示词架构内容');
      return;
    }
    onUse(buildResult());
    onClose();
  };

  const handleSaveAndUse = async () => {
    if (!snippet.trim()) {
      setError('请先粘贴或导入提示词架构内容');
      return;
    }
    if (!name.trim()) {
      setError('请填写架构名称');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/catalog/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          tag: '手动粘贴/导入',
          desc: '用户粘贴或文件导入的提示词架构',
          promptSnippet: snippet.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.error || '保存失败');
      }
      const recipe = data.recipe;
      onSaved?.(recipe);
      onUse(buildResult(recipe));
      onClose();
    } catch (e: any) {
      setError(formatUserError(e, '保存到配方库失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              粘贴 / 导入提示词架构
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              支持整段中文架构文本，或上传 .txt / .md；可立即使用或保存进配方库
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">架构名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-400"
                placeholder="例如：种草级配饰人像架构"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">品类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-400"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                架构正文 ({snippet.length} 字符)
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                上传 .txt / .md
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
            </div>
            <textarea
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              rows={12}
              placeholder={`在此粘贴你的完整提示词架构，例如：\n你是一位擅长拍摄「种草级」人像大片的摄影师…\n请严格按照以下顺序构建描述：\n1. [主体特征] …\n2. [服饰细节-上装] …`}
              className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono leading-relaxed outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 resize-y min-h-[200px]"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleUseNow}
            disabled={!snippet.trim()}
            className="px-3.5 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" />
            立即使用
          </button>
          <button
            type="button"
            onClick={handleSaveAndUse}
            disabled={saving || !snippet.trim()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? '保存中…' : '保存并使用'}
          </button>
        </div>
      </div>
    </div>
  );
}
