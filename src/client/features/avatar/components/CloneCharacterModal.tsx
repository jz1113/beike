import { useState } from 'react';
import { X, Video, Sparkles, AlertCircle } from 'lucide-react';
import { avatarMediaKind } from '@shared/domain/models/avatarDrivers';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { createAvatarCharacter } from '../api/avatarApi';
import { useAvatarStore } from '../store/useAvatarStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CloneCharacterModal({ isOpen, onClose, onSuccess }: Props) {
  const { loadAllAssets } = useAvatarStore();
  const [name, setName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入形象名称');
      return;
    }
    if (!videoUrl.trim() && !file) {
      setError('请上传形象照片或视频');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const mediaUrl = file ? await uploadStudioFile(file, 'avatars') : videoUrl.trim();
      const kind = file?.type.startsWith('image/') || avatarMediaKind(mediaUrl) === 'image' ? 'image' : 'video';
      await createAvatarCharacter({
        name: name.trim(),
        videoUrl: mediaUrl,
        coverUrl: kind === 'image' ? mediaUrl : undefined,
        mediaKind: kind,
        description: description.trim(),
      });
      await loadAllAssets();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '克隆形象提交失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#18181C] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 text-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">克隆新数字人形象</h3>
            <p className="text-xs text-slate-400">基于 Ultralight 唇形骨骼网络训练专属面部模型</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">形象名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：专业顾问·小刘"
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">上传照片或视频 *</label>
            <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-slate-300" />
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://... 或 /storage/avatars/your_video.mp4"
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
            />
            <p className="text-[11px] text-slate-400">
              💡 录制建议：高清正面 1080P，人物位于中央，头部动作平缓，纯色或绿幕背景效果最佳。
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">形象描述备注</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：适用于服装与日用品口播"
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors dark:bg-[#18191c]/95"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  提交训练中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  保存形象素材
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
