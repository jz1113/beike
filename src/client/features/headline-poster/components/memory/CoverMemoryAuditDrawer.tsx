import { useState } from 'react';
import { History, Trash2, X, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getMemoryAuditRecords, getTrashItems, clearTrash, type MemoryAuditRecord, type TrashItem } from '../../model/coverAuditStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CoverMemoryAuditDrawer({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<'audit' | 'trash'>('audit');
  const [audits] = useState<MemoryAuditRecord[]>(() => getMemoryAuditRecords());
  const [trash, setTrash] = useState<TrashItem[]>(() => getTrashItems());

  if (!isOpen) return null;

  const handleClearTrash = () => {
    clearTrash();
    setTrash([]);
  };

  const formatTime = (ts: number) => {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts);
  };

  return (
    <div className="absolute top-4 right-4 z-30 flex h-[calc(100%-32px)] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#1A1A1E]/95 shadow-2xl backdrop-blur-xl">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 p-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">记忆审计流水</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-white/5 px-4 pt-2">
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`border-b-2 px-3 py-2 text-xs font-bold transition-all ${tab === 'audit' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
        >
          实际使用 ({audits.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('trash')}
          className={`border-b-2 px-3 py-2 text-xs font-bold transition-all ${tab === 'trash' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
        >
          回收站 ({trash.length})
        </button>
      </div>

      {/* 内容列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'audit' && (
          <>
            {audits.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <p>暂无记忆采纳流水</p>
                <p className="mt-1 text-[11px] text-slate-400/80">批量生产生成封面时，采纳的风格规则和规避记录会在此沉淀。</p>
              </div>
            ) : (
              audits.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02] p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                      {item.itemTitle}
                    </span>
                    <span>{formatTime(item.timestamp)}</span>
                  </div>

                  {item.adoptedRules.length > 0 && (
                    <div className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[11px]">采纳风格：{item.styleName}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.adoptedRules.join('；')}</div>
                      </div>
                    </div>
                  )}

                  {item.blockedNegatives.length > 0 && (
                    <div className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[11px]">负向拦截</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.blockedNegatives.join('；')}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {tab === 'trash' && (
          <>
            {trash.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">回收站为空</div>
            ) : (
              <>
                <div className="flex justify-end pb-1">
                  <button
                    type="button"
                    onClick={handleClearTrash}
                    className="flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" /> 清空回收站
                  </button>
                </div>
                {trash.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02] p-2.5 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-700 dark:text-slate-300">{item.title}</div>
                      <div className="text-[10px] text-slate-400">{formatTime(item.deletedAt)} 废弃</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
