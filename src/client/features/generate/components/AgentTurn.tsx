import { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileAudio,
  FileText,
  Film,
  Presentation,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { GenerationTask } from '@client/store';
import { useAppStore } from '@client/store';
import { openAgentDocument } from '@client/shared/ui/agentDocumentBus';
import AgentArtifactCard from './AgentArtifactCard';
import {
  agentArtifact,
  agentMultimodalInsights,
  parseAgentAttachments,
  visibleAgentPrompt,
  type ParsedAttachment,
} from '../model/agentArtifact';

const SUGGESTIONS = [
  '你能帮我做哪些创作',
  '根据刚才的结构扩写第二幕分镜',
  '先生成一张概念图看看效果',
];

interface Props {
  task: GenerationTask;
  onRegenerate: (task: GenerationTask) => void;
  onDelete: (task: GenerationTask) => void;
}

function AttachmentPill({ item }: { item: ParsedAttachment }) {
  if (item.kind === 'image') {
    return (
      <div className="relative group overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-2xs">
        <img
          src={item.url}
          alt={item.name}
          className="h-20 w-20 object-cover transition-transform group-hover:scale-105"
        />
        <span className="absolute bottom-0 inset-x-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white backdrop-blur-xs text-center">
          参考图
        </span>
      </div>
    );
  }

  if (item.kind === 'video') {
    return (
      <div className="flex h-20 w-28 flex-col items-center justify-center rounded-xl border border-black/10 bg-slate-900 text-white shadow-2xs">
        <Film className="h-6 w-6 text-cyan-400" />
        <span className="mt-1 max-w-[90%] truncate text-[10px] text-slate-300">
          {item.name}
        </span>
      </div>
    );
  }

  const iconMap = {
    audio: <FileAudio className="h-4 w-4 text-emerald-600" />,
    ppt: <Presentation className="h-4 w-4 text-amber-600" />,
    word: <FileText className="h-4 w-4 text-indigo-600" />,
    pdf: <FileText className="h-4 w-4 text-rose-600" />,
    sheet: <FileText className="h-4 w-4 text-teal-600" />,
    text: <FileText className="h-4 w-4 text-slate-600" />,
    file: <FileText className="h-4 w-4 text-slate-600" />,
  };

  return (
    <div className="inline-flex max-w-[260px] items-center gap-2 rounded-xl border border-black/10 bg-white/90 px-3 py-2 shadow-2xs">
      <span className="shrink-0">{iconMap[item.kind] || iconMap.file}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800">{item.name}</p>
        <p className="text-[10px] text-slate-400">
          {item.kind.toUpperCase()}
          {item.size ? ` · ${(item.size / 1024).toFixed(1)} KB` : ''}
        </p>
      </div>
    </div>
  );
}

export default function AgentTurn({ task, onRegenerate, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const prompt = visibleAgentPrompt(task.prompt || '');
  const attachments = parseAgentAttachments(task);
  const insights = agentMultimodalInsights(attachments);
  const artifact = agentArtifact(task);
  const writing = task.status === 'IN_PROGRESS';

  const reply = artifact
    ? '收到！我已经结合你的构想与多模态素材进行了深度解析，把核心框架与分节执行草案整理如下。你可以点击查看完整文档，也可以继续追问进行局部调优。'
    : '嗨！你来啦～今天想搞点什么？上传图片、视频、音频或方案文档，我随时帮你分析、出图或推演剧本。';

  const fillSuggestion = (text: string) => {
    useAppStore.getState().setQuickPrompt(text);
  };

  const copyReply = async () => {
    try {
      const full = artifact ? `${reply}\n\n${artifact.markdown}` : reply;
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-6 py-2 select-text">
      {/* 1. 用户消息端 (右对齐气泡 + 多模态输入附件卡片) */}
      <div className="flex flex-col items-end gap-2.5">
        {attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 max-w-[85%]">
            {attachments.map((item, idx) => (
              <AttachmentPill key={`${item.url}-${idx}`} item={item} />
            ))}
          </div>
        )}

        {(prompt || attachments.length === 0) && (
          <div className="max-w-[80%] rounded-2xl bg-[#F2F3F5] px-4 py-2.5 text-sm leading-6 text-slate-900 shadow-2xs whitespace-pre-wrap select-text">
            {prompt || '（多模态素材解析）'}
          </div>
        )}
      </div>

      {/* 2. Agent 智能体回复端 (左对齐 + 身份标识 + 分析感知 + 交付物卡片 + 操作栏) */}
      <div className="space-y-4 pr-4">
        {/* 头部身份指示 */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-2xs">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-800">贝壳云图 Agent</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            {writing ? (
              <>
                <Sparkles className="h-3 w-3 animate-spin text-amber-500" />
                正在构思与拆解…
              </>
            ) : (
              '思考完成'
            )}
          </span>
        </div>

        {/* 多模态感知提炼报告 */}
        {insights.length > 0 && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-1">
            <p className="text-[11px] font-semibold text-blue-900 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-blue-600" />
              多模态感知输入分析
            </p>
            {insights.map((msg, i) => (
              <p key={i} className="text-xs text-blue-800/90 leading-relaxed">
                {msg}
              </p>
            ))}
          </div>
        )}

        {/* 文本回复 */}
        <p className="text-sm leading-7 text-slate-800 whitespace-pre-wrap">
          {reply}
        </p>

        {/* 产出物卡片 (MD / PPT / Word) */}
        {artifact && (
          <AgentArtifactCard
            filename={artifact.filename}
            kind={artifact.kind}
            sizeLabel={artifact.sizeLabel}
            writing={writing}
            onOpen={() =>
              openAgentDocument({
                filename: artifact.filename,
                content: artifact.markdown,
                createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
              })
            }
          />
        )}

        {/* 智能追问建议 */}
        <div className="space-y-1.5 pt-1">
          <p className="text-xs text-slate-400">你可以继续向 Agent 提问：</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => fillSuggestion(item)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* 底部操作与管理栏 (重新生成、复制、删除单条对话) */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRegenerate(task)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              重新生成
            </button>
            <button
              type="button"
              aria-label="复制回答"
              title="复制回答"
              onClick={() => void copyReply()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" />
              )}
            </button>
            <button
              type="button"
              aria-label="删除本轮对话"
              title="删除本轮对话"
              onClick={() => onDelete(task)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-400 shadow-2xs hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-[11px] text-slate-400">内容由 AI 生成</span>
        </div>
      </div>
    </div>
  );
}
