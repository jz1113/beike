'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Search, 
  X, 
  Clock, 
  Check, 
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIAssistantHistoryDrawer({ isOpen, onClose }: Props) {
  const {
    assistantSessions,
    currentAssistantSessionId,
    createAssistantSession,
    switchAssistantSession,
    deleteAssistantSession
  } = useAppStore();

  const [searchKeyword, setSearchKeyword] = useState('');

  if (!isOpen) return null;

  const filteredSessions = assistantSessions.filter(s => 
    s.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    s.messages.some(m => m.content.toLowerCase().includes(searchKeyword.toLowerCase()))
  );

  return (
    <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-xl flex flex-col animate-fade-in text-slate-800 select-none border-l border-slate-200 shadow-2xl">
      {/* Header */}
      <div className="h-14 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-500" />
          <span className="text-sm font-bold text-slate-900">历史对话记录</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[10px] font-mono font-medium">
            {assistantSessions.length} 个会话
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              createAssistantSession();
              onClose();
            }}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-md cursor-pointer active:scale-95"
            title="发起新对话"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新对话</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/40">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            placeholder="搜索历史对话内容或标题..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-red-500 focus:bg-white transition-colors shadow-2xs"
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
        {filteredSessions.length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
            <MessageSquare className="w-8 h-8 opacity-30" />
            <span className="text-xs font-medium">暂无匹配的对话记录</span>
          </div>
        ) : (
          filteredSessions.map((sess) => {
            const isSelected = sess.id === currentAssistantSessionId;
            const messageCount = sess.messages.length;
            const lastMsg = sess.messages[sess.messages.length - 1];

            return (
              <div
                key={sess.id}
                onClick={() => {
                  switchAssistantSession(sess.id);
                  onClose();
                }}
                className={`p-3 rounded-2xl transition-all cursor-pointer group flex items-center justify-between gap-3 border ${
                  isSelected
                    ? 'bg-red-50/80 border-red-300 shadow-xs ring-1 ring-red-200 text-slate-900'
                    : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700 shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-gradient-to-tr from-red-600 to-orange-500 text-white shadow-xs' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                        {sess.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                        {messageCount} 条
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {lastMsg ? lastMsg.content : '空对话'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定删除会话「${sess.title}」吗？`)) {
                        deleteAssistantSession(sess.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="删除对话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
