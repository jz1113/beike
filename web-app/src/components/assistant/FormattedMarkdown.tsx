'use client';

import React, { useState } from 'react';
import { Copy, Check, Sparkles, Image as ImageIcon } from 'lucide-react';

interface Props {
  content: string;
  className?: string;
  onUsePrompt?: (prompt: string, aspectRatio?: string) => void;
}

export default function FormattedMarkdown({ content, className = '', onUsePrompt }: Props) {
  if (!content) return null;

  // 预处理文本：清理多余的 Markdown 残留符号
  const cleanContent = content
    .replace(/\*\*(.*?):\s*\*\*/g, '**$1:**')
    .replace(/\*\*(.*?)\s*\*\*/g, '**$1**');

  const lines = cleanContent.split('\n');

  return (
    <div className={`space-y-2.5 text-xs sm:text-[13px] leading-relaxed select-text text-slate-700 ${className}`}>
      {renderLines(lines, onUsePrompt)}
    </div>
  );
}

function renderLines(lines: string[], onUsePrompt?: (prompt: string, aspectRatio?: string) => void) {
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块处理
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        const codeText = codeBlockLines.join('\n');
        const isPromptLike = checkIfPromptLike(codeText);
        elements.push(
          <CodeBlock 
            key={`code-${i}`} 
            code={codeText} 
            lang={codeBlockLang} 
            isPrompt={isPromptLike}
            onUsePrompt={onUsePrompt}
          />
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        // 开始代码块
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 分割线 (---, ***, ___)
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      elements.push(
        <div key={`hr-${i}`} className="my-3 border-t border-slate-200" />
      );
      continue;
    }

    // 空行
    if (!line.trim()) {
      elements.push(<div key={`empty-${i}`} className="h-1" />);
      continue;
    }

    // 标题处理 (####, ###, ##, #)
    if (line.startsWith('#### ')) {
      elements.push(
        <h6 key={`h4-${i}`} className="font-bold text-slate-900 text-xs mt-3 mb-1.5 flex items-center gap-1.5 bg-slate-100/90 px-2.5 py-1.5 rounded-xl border border-slate-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span>{renderInline(line.slice(5))}</span>
        </h6>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h5 key={`h3-${i}`} className="font-bold text-slate-900 text-xs sm:text-[13px] mt-3 mb-1.5 flex items-center gap-1.5 pb-1 border-b border-slate-100">
          <span className="w-1.5 h-3.5 rounded-full bg-indigo-500" />
          <span>{renderInline(line.slice(4))}</span>
        </h5>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h4 key={`h2-${i}`} className="font-bold text-slate-900 text-sm mt-4 mb-2 flex items-center gap-2 pb-1.5 border-b border-slate-100">
          <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-indigo-600 to-purple-600" />
          <span>{renderInline(line.slice(3))}</span>
        </h4>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h3 key={`h1-${i}`} className="font-extrabold text-slate-900 text-base mt-4 mb-2.5 flex items-center gap-2 pb-2 border-b border-slate-200">
          <span className="w-2 h-4.5 rounded-full bg-gradient-to-b from-indigo-600 to-purple-600" />
          <span>{renderInline(line.slice(2))}</span>
        </h3>
      );
      continue;
    }

    // 引用块与提示词检测 (>)
    if (line.startsWith('> ')) {
      const quoteText = line.slice(2).trim();
      const isPrompt = checkIfPromptLike(quoteText);

      if (isPrompt) {
        // 如果是绘图提示词，渲染为生图操作卡片
        const ratioMatch = quoteText.match(/--ar\s+([0-9:]+)/);
        const ar = ratioMatch ? ratioMatch[1] : undefined;

        elements.push(
          <div key={`prompt-card-${i}`} className="my-3 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/60 to-slate-50 border border-indigo-200/90 space-y-2.5 shadow-2xs group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-[11px] font-bold text-indigo-900">生图提示词</span>
                {ar && (
                  <span className="px-1.5 py-0.2 rounded-md bg-white border border-indigo-200 text-indigo-700 font-mono text-[10px] font-bold shadow-2xs">
                    --ar {ar}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {onUsePrompt && (
                  <button
                    type="button"
                    onClick={() => onUsePrompt(quoteText, ar)}
                    className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs active:scale-95"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>去生图</span>
                  </button>
                )}
                <CopyButton text={quoteText} />
              </div>
            </div>

            <div className="text-xs text-slate-800 font-mono leading-relaxed bg-white/95 border border-indigo-100/80 p-3 rounded-xl break-words select-text shadow-2xs">
              {quoteText}
            </div>
          </div>
        );
      } else {
        elements.push(
          <blockquote key={`quote-${i}`} className="border-l-3 border-indigo-500 pl-3 py-1.5 bg-indigo-50/40 rounded-r-xl text-slate-700 italic my-2 text-xs sm:text-[13px]">
            {renderInline(quoteText)}
          </blockquote>
        );
      }
      continue;
    }

    // 列表项 (*, -, +, •, ·)
    const bulletMatch = line.match(/^(\s*)[*\-+•·]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const text = bulletMatch[2];
      elements.push(
        <div key={`bullet-${i}`} className={`flex items-start gap-2 ${indent > 0 ? 'ml-4' : 'ml-0.5'} my-1`}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
          <div className="flex-1 text-slate-700 leading-relaxed">{renderInline(text)}</div>
        </div>
      );
      continue;
    }

    // 数字序号列表 (1., 2., 3.)
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length;
      const num = numMatch[2];
      const text = numMatch[3];
      elements.push(
        <div key={`num-${i}`} className={`flex items-start gap-2.5 ${indent > 0 ? 'ml-4' : 'ml-0.5'} my-2`}>
          <span className="w-5 h-5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
            {num}
          </span>
          <div className="flex-1 text-slate-700 leading-relaxed pt-0.5">{renderInline(text)}</div>
        </div>
      );
      continue;
    }

    // 普通段落
    elements.push(
      <p key={`p-${i}`} className="text-slate-700 leading-relaxed break-words my-1">
        {renderInline(line)}
      </p>
    );
  }

  return elements;
}

// 检查文本是否极像绘图提示词
function checkIfPromptLike(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('--ar') || 
    t.includes('--v 6') || 
    t.includes('--style raw') ||
    (t.includes('shot of') && t.includes('lighting')) ||
    (t.includes('photography') && t.includes('photorealistic')) ||
    (t.includes('8k') && t.includes('render'))
  );
}

// 行内解析器：处理 **粗体**、`行内代码`、*斜体*
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const codeIdx = remaining.indexOf('`');
    const boldIdx1 = remaining.indexOf('**');
    const boldIdx2 = remaining.indexOf('__');

    const validIndices = [
      codeIdx !== -1 ? { type: 'code', idx: codeIdx } : null,
      boldIdx1 !== -1 ? { type: 'bold_star', idx: boldIdx1 } : null,
      boldIdx2 !== -1 ? { type: 'bold_under', idx: boldIdx2 } : null,
    ].filter(Boolean) as { type: string; idx: number }[];

    if (validIndices.length === 0) {
      tokens.push(
        <span key={`txt-${keyIdx++}`}>
          {remaining.replace(/\*\*/g, '')}
        </span>
      );
      break;
    }

    validIndices.sort((a, b) => a.idx - b.idx);
    const earliest = validIndices[0];

    // 先把标记前面的普通文本加入 tokens
    if (earliest.idx > 0) {
      const plain = remaining.slice(0, earliest.idx);
      tokens.push(
        <span key={`txt-${keyIdx++}`}>
          {plain.replace(/\*\*/g, '')}
        </span>
      );
      remaining = remaining.slice(earliest.idx);
    }

    // 处理行内代码
    if (earliest.type === 'code') {
      const endIdx = remaining.indexOf('`', 1);
      if (endIdx !== -1) {
        const codeContent = remaining.slice(1, endIdx);
        tokens.push(
          <code 
            key={`code-${keyIdx++}`} 
            className="px-1.5 py-0.5 rounded-md bg-slate-100 text-amber-800 font-mono text-[11px] border border-slate-200 mx-0.5"
          >
            {codeContent}
          </code>
        );
        remaining = remaining.slice(endIdx + 1);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>`</span>);
        remaining = remaining.slice(1);
      }
    } else if (earliest.type === 'bold_star') {
      const endIdx = remaining.indexOf('**', 2);
      if (endIdx !== -1) {
        const boldContent = remaining.slice(2, endIdx);
        tokens.push(
          <strong 
            key={`bold-${keyIdx++}`} 
            className="font-bold text-slate-900 tracking-wide px-0.5"
          >
            {boldContent}
          </strong>
        );
        remaining = remaining.slice(endIdx + 2);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>**</span>);
        remaining = remaining.slice(2);
      }
    } else if (earliest.type === 'bold_under') {
      const endIdx = remaining.indexOf('__', 2);
      if (endIdx !== -1) {
        const boldContent = remaining.slice(2, endIdx);
        tokens.push(
          <strong 
            key={`bold-${keyIdx++}`} 
            className="font-bold text-slate-900 tracking-wide px-0.5"
          >
            {boldContent}
          </strong>
        );
        remaining = remaining.slice(endIdx + 2);
      } else {
        tokens.push(<span key={`txt-${keyIdx++}`}>__</span>);
        remaining = remaining.slice(2);
      }
    }
  }

  return <>{tokens}</>;
}

// 独立小复制按钮
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-white/80 transition-colors cursor-pointer"
      title="复制提示词"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// 独立代码块组件
function CodeBlock({ 
  code, 
  lang, 
  isPrompt,
  onUsePrompt 
}: { 
  code: string; 
  lang?: string; 
  isPrompt?: boolean; 
  onUsePrompt?: (prompt: string, aspectRatio?: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ratioMatch = code.match(/--ar\s+([0-9:]+)/);
  const ar = ratioMatch ? ratioMatch[1] : undefined;

  return (
    <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 my-2.5 text-xs font-mono shadow-md">
      <div className="px-3.5 py-2 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{lang || (isPrompt ? 'PROMPT' : 'CODE')}</span>
          {ar && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
              --ar {ar}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPrompt && onUsePrompt && (
            <button
              type="button"
              onClick={() => onUsePrompt(code, ar)}
              className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer font-bold"
            >
              <Sparkles className="w-3 h-3" />
              <span>去生图</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制代码'}</span>
          </button>
        </div>
      </div>
      <pre className="p-3.5 overflow-x-auto text-slate-100 leading-relaxed selection:bg-red-500/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}
