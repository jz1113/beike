import { useState } from 'react';
import { Play, Download, Trash2, RotateCcw, Film, AlertCircle } from 'lucide-react';
import { useAvatarStore } from '../store/useAvatarStore';
import { useAvatarTaskPolling } from '../hooks/useAvatarTaskPolling';
import type { AvatarVideoTask } from '@shared/contracts';

interface Props {
  onReuseTask: (task: AvatarVideoTask) => void;
}

export default function AvatarCreationsView({ onReuseTask }: Props) {
  const { tasks, removeTask } = useAvatarStore();
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  useAvatarTaskPolling();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-6">
      {/* 头部标题 */}
      <div>
        <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
          <Film className="w-5 h-5 text-indigo-400" />
          口播视频生成记录与成片
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          管理所有合成的口播视频、查看多阶段实时渲染进度或复用配方再次编辑
        </p>
      </div>

      {/* 列表流 */}
      <div className="flex-1 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3 dark:text-slate-400">
            <Film className="w-10 h-10 stroke-1" />
            <p className="text-xs">暂无生成的短视频，前往工作台开始第一次创作吧</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tasks.map((task) => {
              const isRunning = task.status === 0;
              const isSuccess = task.status === 1;

              return (
                <div
                  key={task.id}
                  className="flex flex-col bg-[#1A1A1E] rounded-2xl border border-white/10 overflow-hidden shadow-lg group hover:border-white/20 transition-all"
                >
                  {/* 顶部视频海报或生成动效 */}
                  <div className="relative aspect-video w-full bg-black/60 flex items-center justify-center overflow-hidden">
                    {isRunning ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 w-full">
                        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <div className="w-full space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-indigo-400 font-medium">{task.currentStage}</span>
                            <span className="text-slate-400 font-mono">{task.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate max-w-xs">{task.statusMsg}</p>
                      </div>
                    ) : isSuccess ? (
                      <>
                        <img
                          src={task.coverUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setPlayingVideo(task.videoUrl || '')}
                            className="w-12 h-12 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all dark:text-slate-100 dark:bg-[#18191c]/95"
                          >
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </button>
                        </div>
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono text-white">
                          {task.duration ? `${task.duration.toFixed(1)}s` : '1080P'}
                        </div>
                      </>
                    ) : (
                      <div className="p-4 text-center text-rose-400 flex flex-col items-center gap-2">
                        <AlertCircle className="w-6 h-6" />
                        <span className="text-xs">{task.error || '合成发生异常'}</span>
                      </div>
                    )}
                  </div>

                  {/* 任务详情与台词 */}
                  <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-white text-xs truncate max-w-[200px]">
                          {task.title}
                        </h3>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            isRunning
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : isSuccess
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isRunning ? '生成中' : isSuccess ? '已成片' : '失败'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {task.scriptContent}
                      </p>
                    </div>

                    {/* 底部动作栏 */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => onReuseTask(task)}
                        className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        复用配方
                      </button>

                      <div className="flex items-center gap-1">
                        {isSuccess && task.videoUrl && (
                          <a
                            href={task.videoUrl}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="下载成片"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`确定删除记录【${task.title}】吗？`)) {
                              removeTask(task.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/10 transition-colors dark:text-slate-400"
                          title="删除记录"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 视频全屏试看 */}
      {playingVideo && (
        <div
          onClick={() => setPlayingVideo(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-black rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
          >
            <video
              src={playingVideo}
              controls
              autoPlay
              className="w-full aspect-[9/16] max-h-[75vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
