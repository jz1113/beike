import { useState } from 'react';
import { Plus, Check, Play, Trash2, Sparkles, User, ShieldCheck } from 'lucide-react';
import { useAvatarStore } from '../store/useAvatarStore';
import CloneCharacterModal from './CloneCharacterModal';

interface Props {
  onSelectCharacter?: (id: string) => void;
}

export default function AvatarCharactersView({ onSelectCharacter }: Props) {
  const { characters, selectedCharacterId, setSelectedCharacterId, removeCharacter } = useAvatarStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelectedCharacterId(id);
    onSelectCharacter?.(id);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-6">
      {/* 头部标题与新建按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            数字人形象资产库
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            提供高颜值系统预设形象与私有训练形象，支持自然逼真的嘴部唇形与面部微动作驱动
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          克隆新形象
        </button>
      </div>

      {/* 形象卡片网格 */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {characters.map((char) => {
            const isSelected = char.id === selectedCharacterId;
            const isPreset = char.type === 0;

            return (
              <div
                key={char.id}
                onClick={() => handleSelect(char.id)}
                className={`group relative flex flex-col bg-[#1A1A1E] rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-xl shadow-indigo-500/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* 封面图片 */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                  <img
                    src={char.coverUrl}
                    alt={char.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                  {/* 预设与状态角标 */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    {isPreset ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/80 backdrop-blur-md text-[10px] font-medium text-white shadow-xs">
                        <ShieldCheck className="w-3 h-3" />
                        官方预设
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/80 backdrop-blur-md text-[10px] font-medium text-white shadow-xs">
                        <Sparkles className="w-3 h-3" />
                        专属克隆
                      </span>
                    )}
                  </div>

                  {/* 试看按钮 */}
                  {char.welcomeVideoUrl && (
                    <button
                      type="button"
                      title="预览形象效果"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewVideo(char.welcomeVideoUrl || char.videoUrl);
                      }}
                      className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-white hover:text-black opacity-0 group-hover:opacity-100 transition-all dark:hover:bg-white/10"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}

                  {/* 选中勾选指示 */}
                  {isSelected && (
                    <div className="absolute bottom-2.5 right-2.5 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* 底部信息 */}
                <div className="p-3 flex flex-col justify-between flex-1 gap-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-xs truncate">{char.name}</h3>
                    {!isPreset && (
                      <button
                        type="button"
                        title="删除该自定义形象"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确定删除形象【${char.name}】吗？`)) {
                            removeCharacter(char.id);
                          }
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-md transition-colors dark:text-slate-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {char.description || '支持全高清对口型驱动合成'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 视频试看播放器模态框 */}
      {previewVideo && (
        <div
          onClick={() => setPreviewVideo(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-black rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
          >
            <video
              src={previewVideo}
              controls
              autoPlay
              className="w-full aspect-[9/16] max-h-[70vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* 克隆新形象弹窗 */}
      <CloneCharacterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
}
