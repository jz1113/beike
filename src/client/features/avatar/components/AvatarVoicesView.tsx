import { useState } from 'react';
import { Plus, Play, Pause, Trash2, Check, Mic } from 'lucide-react';
import { useAvatarStore } from '../store/useAvatarStore';
import CloneVoiceModal from './CloneVoiceModal';

interface Props {
  onSelectVoice?: (id: string) => void;
}

export default function AvatarVoicesView({ onSelectVoice }: Props) {
  const { voices, selectedVoiceId, setSelectedVoiceId, removeVoice } = useAvatarStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const togglePlay = (id: string, url: string) => {
    if (playingVoiceId === id && audioElement) {
      audioElement.pause();
      setPlayingVoiceId(null);
      return;
    }
    if (audioElement) {
      audioElement.pause();
    }
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => setPlayingVoiceId(null);
    setAudioElement(audio);
    setPlayingVoiceId(id);
  };

  const handleSelect = (id: string) => {
    setSelectedVoiceId(id);
    onSelectVoice?.(id);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-6">
      {/* 头部标题与新建按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-purple-400" />
            声音克隆与音色库
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            基于 Fish-Speech 语言模型与离散声学分词，高保真还原音色与情绪张力
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          克隆新音色
        </button>
      </div>

      {/* 音色卡片列表 */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.map((voice) => {
            const isSelected = voice.id === selectedVoiceId;
            const isPlaying = playingVoiceId === voice.id;
            const isPreset = voice.type === 0;

            return (
              <div
                key={voice.id}
                onClick={() => handleSelect(voice.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 bg-[#1A1A1E] ${
                  isSelected
                    ? 'border-purple-500 ring-2 ring-purple-500/30 shadow-xl shadow-purple-500/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* 试听播放按钮 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay(voice.id, voice.sampleAudioUrl || voice.audioUrl);
                      }}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        isPlaying
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white/10 text-slate-200 hover:bg-white/20 hover:text-white dark:bg-[#18191c]/95'
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-xs">{voice.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 dark:bg-[#18191c]/95">
                          {voice.gender === 'male' ? '男声' : '女声'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isPreset ? '官方精选音色' : '专属克隆音色'}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* 示范文案 */}
                {voice.promptText && (
                  <p className="text-[11px] text-slate-300 bg-black/30 p-2.5 rounded-xl border border-white/5 line-clamp-2 leading-relaxed italic">
                    "{voice.promptText}"
                  </p>
                )}

                {/* 底部标签与操作 */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {(voice.tags || []).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {!isPreset && (
                    <button
                      type="button"
                      title="删除该音色"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除音色【${voice.name}】吗？`)) {
                          removeVoice(voice.id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors dark:text-slate-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 克隆新声音弹窗 */}
      <CloneVoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
}
