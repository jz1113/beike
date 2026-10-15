import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  Bold,
  Check,
  Code,
  Copy,
  Download,
  Heading1,
  Italic,
  List,
  ListOrdered,
  Quote,
  Star,
  Strikethrough,
  Table,
  Underline,
  X,
} from 'lucide-react';
import FormattedMarkdown from '../message/FormattedMarkdown';

interface Props {
  filename: string;
  content: string;
  createdAt?: number;
  onClose: () => void;
}

function formatCreatedAt(value?: number) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function countChars(content: string) {
  const count = content.replace(/\s/g, '').length;
  return count.toLocaleString();
}

function resolveFileBadge(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
    return { label: 'PPT', bg: 'bg-amber-600 text-white' };
  }
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return { label: 'DOC', bg: 'bg-indigo-600 text-white' };
  }
  return { label: 'MD', bg: 'bg-blue-600 text-white' };
}

export default function DocumentViewerModal({ filename, content, createdAt, onClose }: Props) {
  const [starred, setStarred] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    const isDoc = filename.endsWith('.docx') || filename.endsWith('.doc');
    const isPpt = filename.endsWith('.pptx') || filename.endsWith('.ppt');
    const mime = isDoc
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : isPpt
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'text/markdown;charset=utf-8';

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2500);
    } catch {
      setCopied('复制失败');
    }
  };

  const badge = resolveFileBadge(filename);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-6 backdrop-blur-xs select-text animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={filename}
        className="flex h-[min(940px,94vh)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200/80"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 1. 顶部 Header 元信息导航栏 */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-6 bg-slate-50/70">
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-slate-500">
            <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] font-bold tracking-wider ${badge.bg}`}>
              {badge.label}
            </span>
            <span className="truncate text-sm font-semibold text-slate-900">{filename}</span>
            <span className="hidden shrink-0 sm:inline text-slate-400">|</span>
            <span className="hidden shrink-0 sm:inline font-medium text-slate-600">{countChars(content)} 字</span>
            <span className="hidden shrink-0 md:inline text-slate-400">·</span>
            <span className="hidden shrink-0 md:inline">创建于 {formatCreatedAt(createdAt)}</span>
            <span className="hidden shrink-0 lg:inline-flex items-center gap-1 rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] text-slate-600">
              内容由 AI 生成
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 text-slate-600">
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>下载</span>
            </button>

            <button
              type="button"
              onClick={() => void copy('已复制全文内容', content)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 text-slate-500" />
              <span>复制全文</span>
            </button>

            <button
              type="button"
              aria-pressed={starred}
              onClick={() => setStarred((value) => !value)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
              title={starred ? '已收藏' : '收藏'}
            >
              <Star className={`h-4 w-4 ${starred ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
            </button>

            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-2xs hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {copied && (
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-6 py-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            <span>{copied}</span>
          </div>
        )}

        {/* 2. 排版控制与格式标识条 */}
        <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-200/80 px-6 py-2 text-slate-400 bg-white">
          <div className="flex items-center gap-1">
            {[Heading1, List, ListOrdered, Quote, Table, AlignLeft, Bold, Strikethrough, Italic, Underline, Code].map((Icon, index) => (
              <span
                key={index}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-auto hidden sm:inline">富文本标准预览</span>
        </div>

        {/* 3. 沉浸式 Markdown 文档正文 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-16 bg-[#FAFAFC]">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 sm:p-12 shadow-xs border border-slate-200/80 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-slate-700 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:bg-blue-50/40 [&_blockquote]:px-4 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r-xl [&_blockquote]:text-slate-700 [&_table]:w-full [&_table]:text-[13px] [&_table]:border-collapse [&_th]:bg-slate-50 [&_th]:text-slate-900 [&_th]:font-semibold [&_th]:p-3 [&_th]:border [&_th]:border-slate-200 [&_td]:p-3 [&_td]:border [&_td]:border-slate-200 [&_td]:text-slate-700 [&_tr:nth-child(even)]:bg-slate-50/30 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:text-sm [&_li]:leading-7 [&_li]:text-slate-700">
            <FormattedMarkdown content={content} accentColor="slate" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
