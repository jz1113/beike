import { useState } from 'react';
import { X, Mic, Sparkles, AlertCircle } from 'lucide-react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { createAvatarVoice } from '../api/avatarApi';
import { useAvatarStore } from '../store/useAvatarStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CloneVoiceModal({ isOpen, onClose, onSuccess }: Props) {
  const { loadAllAssets, selectedVoiceModel } = useAvatarStore();
  const [name, setName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [promptText, setPromptText] = useState('');
  const [gender, setGender] = useState('female');
  const [tagsStr, setTagsStr] = useState('高保真, 营销');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入音色名称');
      return;
    }
    if (!audioUrl.trim() && !file) {
      setError('请上传参考音频');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const tags = tagsStr
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const route = resolveModalityModelRoute('voice', selectedVoiceModel);
      const uploaded = file ? await uploadStudioFile(file, 'voices') : audioUrl.trim();
      await createAvatarVoice({
        name: name.trim(),
        audioUrl: uploaded,
        promptText: promptText.trim(),
        gender,
        tags,
        provider: route.modelId,
        model: route.modelId,
        baseUrl: route.baseUrl,
        apiKey: route.apiKey,
      });
      await loadAllAssets();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '克隆声音提交失败');
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
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">克隆新声音</h3>
            <p className="text-xs text-slate-400">上传 5–15 秒清晰音频，按当前配音模型提交 MiniMax 或 ElevenLabs 克隆</p>
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
            <label className="font-medium text-slate-300">音色名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：磁性男主播·大明"
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">上传参考音频 *</label>
            <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-slate-300" />
            <input
              type="text"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://... 或 /storage/voices/sample.wav"
              className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-slate-300">参考音频台词内容 (Prompt Text)</label>
            <textarea
              rows={2}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="输入参考音频中所说的完整文本，有助于极大幅度提升发音精准度"
              className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-medium text-slate-300">性别</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-white text-xs focus:outline-none"
              >
                <option value="female" className="bg-slate-900">女性音色</option>
                <option value="male" className="bg-slate-900">男性音色</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-300">标签分类 (逗号分隔)</label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="热情, 治愈, 商务"
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
              />
            </div>
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
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  提取分词中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  提取并保存音色
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
