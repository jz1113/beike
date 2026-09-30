import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatPromptParagraphs } from '@shared/domain/media/drawing';

interface Props {
  itemId: string | number;
  prompt: string;
  isVideo: boolean;
}

export function InspirationPromptPanel({ itemId, prompt, isVideo }: Props) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(true);
  const promptParagraphs = useMemo(() => formatPromptParagraphs(prompt), [prompt]);
  const isLongPrompt = prompt.length > 120 || promptParagraphs.length > 2;

  useEffect(() => {
    setIsPromptExpanded(true);
  }, [itemId]);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-normal text-slate-400 shrink-0">
            {isVideo ? '视频提示词' : '图片提示词'}
          </span>
        </div>
        {isLongPrompt && (
          <button
            type="button"
            onClick={() => setIsPromptExpanded(!isPromptExpanded)}
            className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors cursor-pointer py-0.5 px-2 rounded-lg hover:bg-indigo-50"
            title={isPromptExpanded ? '收起长文本' : '展开查看完整提示词'}
          >
            <span>{isPromptExpanded ? '收起' : '展开全文'}</span>
            {isPromptExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </button>
        )}
      </div>

      <div className="relative">
        <div
          className={`text-[13px] sm:text-[13.5px] text-slate-800 leading-relaxed font-normal select-text transition-all duration-300 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 pr-1 space-y-2.5 ${
            isPromptExpanded
              ? 'max-h-[50vh] pb-2'
              : 'max-h-40'
          }`}
        >
          {promptParagraphs.map((para, pIdx) => (
            <p key={pIdx} className="break-words leading-relaxed">
              {para}
            </p>
          ))}
        </div>

        {/* 收起状态且为长文本时，底部半透明渐变平滑遮罩（点击亦可展开全文） */}
        {!isPromptExpanded && isLongPrompt && (
          <div
            onClick={() => setIsPromptExpanded(true)}
            className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white via-white/70 to-transparent pointer-events-auto cursor-pointer"
            title="点击展开全文"
          />
        )}
      </div>
    </div>

  );
}
