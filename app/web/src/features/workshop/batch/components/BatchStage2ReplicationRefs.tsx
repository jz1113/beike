import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { BatchProductItem } from '../batchTypes';

export interface BatchStage2ReplicationRefsProps {
  replicationInputMode: 'one_to_one' | 'matrix';
  setReplicationInputMode: (mode: 'one_to_one' | 'matrix') => void;
  matrixMasterRefUrl: string;
  setMatrixMasterRefUrl: (url: string) => void;
  handleParseMatrixMasterRef: () => Promise<void>;
  isMatrixParsing: boolean;
  isBatchRefParsing: boolean;
  handleBatchParse1to1Refs: () => Promise<void>;
  successfulItems: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  handleRemoveItem: (id: string) => void;
  onNextStage: () => void;
}

export const BatchStage2ReplicationRefs: React.FC<BatchStage2ReplicationRefsProps> = ({
  replicationInputMode,
  setReplicationInputMode,
  matrixMasterRefUrl,
  setMatrixMasterRefUrl,
  handleParseMatrixMasterRef,
  isMatrixParsing,
  isBatchRefParsing,
  handleBatchParse1to1Refs,
  successfulItems,
  setItems,
  handleRemoveItem,
  onNextStage,
}) => {
  return (
    <div className="space-y-6">
      <div className="space-y-4 pb-12">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">对标爆款素材采集模式</h3>
            <p className="text-xs text-slate-500 mt-0.5">支持为单款商品分别对标或单篇爆款母版分发</p>
          </div>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setReplicationInputMode('one_to_one')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                replicationInputMode === 'one_to_one' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              1对1 分别对标
            </button>
            <button
              type="button"
              onClick={() => setReplicationInputMode('matrix')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                replicationInputMode === 'matrix' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
              }`}
            >
              1对多 爆款母版分发
            </button>
          </div>
        </div>

        {replicationInputMode === 'matrix' ? (
          <div className="py-2 space-y-2">
            <span className="text-xs font-bold text-slate-700 block">输入 1 篇爆款母版笔记链接：</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={matrixMasterRefUrl}
                onChange={e => setMatrixMasterRefUrl(e.target.value)}
                placeholder="粘贴小红书/抖音爆款笔记链接..."
                className="flex-1 p-2.5 rounded-lg bg-slate-50 border-b border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleParseMatrixMasterRef}
                disabled={isMatrixParsing || !matrixMasterRefUrl.trim()}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                {isMatrixParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>解析母版参考图</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs text-slate-500">为每款商品指定对标链接（按回车或一键并发）：</span>
              <button
                type="button"
                onClick={handleBatchParse1to1Refs}
                disabled={isBatchRefParsing}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                {isBatchRefParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>一键并发解析所有对标链接</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto pr-1">
              {successfulItems.map(item => (
                <div key={item.id} className="py-3 flex items-center gap-3">
                  <img
                    src={item.coverImage}
                    className="w-11 h-11 rounded-lg object-cover bg-slate-100 shrink-0"
                    alt=""
                  />
                  <div className="w-40 sm:w-56 shrink-0 min-w-0">
                    <h5 className="text-xs font-bold text-slate-900 truncate" title={item.title}>
                      {item.title}
                    </h5>
                    <span className="text-[11px] text-slate-400 font-mono">SKU: {item.itemId}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={item.referenceUrl || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setItems(prev => prev.map(p => p.id === item.id ? { ...p, referenceUrl: val } : p));
                      }}
                      placeholder="粘贴对标笔记链接..."
                      className="flex-1 p-2 rounded-lg bg-slate-50 border-b border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                    {item.availableReferenceImages.length > 0 && (
                      <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        已提取 {item.availableReferenceImages.length} 图
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onNextStage}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer flex items-center gap-2 shadow-sm"
          >
            <span>下一步：选图与对标配对</span>
          </button>
        </div>
      </div>
    </div>
  );
};
