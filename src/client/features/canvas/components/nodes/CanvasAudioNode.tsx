import React, { useEffect, useRef, useState } from 'react';
import { Music, Play, Pause, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
}

export const CanvasAudioNode: React.FC<Props> = ({ node, projectId }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [text, setText] = useState(node.content || '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !node.audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      void audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleGenerateTTS = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text.trim() || generating) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError('');
    updateNode(projectId, node.id, { status: 'generating', content: text });
    try {
      const { customBaseUrl, customApiKey } = getGatewayClientOverrides();
      const res = await apiFetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getGatewayClientHeaders() },
        body: JSON.stringify({ text, prompt: text, format: 'mp3', customBaseUrl, customApiKey }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || typeof data.audioUrl !== 'string' || !data.audioUrl) {
        throw new Error(typeof data?.error === 'string' ? data.error : '配音失败');
      }
      recordChatTokens({ modelId: typeof data.model === 'string' ? data.model : 'speech-2.8-hd', type: 'audio', usage: data.usage });
      updateNode(projectId, node.id, {
        content: text,
        title: text.slice(0, 15) || '台词配音',
        audioUrl: data.audioUrl,
        status: 'success',
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : '配音失败';
      setError(message);
      updateNode(projectId, node.id, { content: text, status: 'error' });
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  };

  return (
    <div
      className="relative flex flex-col w-full h-full rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-200/90 dark:border-white/10 shadow-lg p-4 select-none"
      style={{ minHeight: `${node.height || 220}px` }}
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-violet-500" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">
            {node.title || 'AI 配音 / 旁白音频'}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 font-medium">
          <Volume2 className="w-3 h-3" />
          <span>TTS / BGM</span>
        </span>
      </div>

      {/* 音频播放条或文本输入 */}
      <div className="flex-1 py-3 flex flex-col justify-center gap-3">
        {node.audioUrl ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/30">
            <audio
              ref={audioRef}
              src={proxyMediaUrl(node.audioUrl)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0 shadow-sm cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{node.title || '音频轨'}</p>
              <div className="flex items-center gap-1 mt-1">
                {[4, 12, 8, 16, 6, 14, 10, 18, 5, 12, 7, 15, 9, 4, 11].map((h, i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full ${isPlaying ? 'bg-violet-500 animate-pulse' : 'bg-slate-300 dark:bg-zinc-700'}`}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入短剧角色台词或旁白，点击生成配音..."
              className="w-full h-20 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-violet-500"
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              disabled={generating || !text.trim()}
              onClick={handleGenerateTTS}
              className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-40"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>生成配音音频</span>
            </button>
            {error ? <p className="text-[11px] text-rose-500">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
};
