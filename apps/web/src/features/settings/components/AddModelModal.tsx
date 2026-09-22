import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import type { WorkflowModel } from '../settingsShared';

interface AddModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (model: WorkflowModel) => void;
}

export default function AddModelModal({
  isOpen,
  onClose,
  onAdd,
}: AddModelModalProps) {
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [newModelFeatures, setNewModelFeatures] = useState({
    isMultimodal: true,
    isImage: false,
    isVideo: false,
    isVision: true,
    isAssistant: true,
    isDistill: false,
    isThinking: false,
  });

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!newModelId.trim()) {
      alert('请填写模型 ID');
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    const isMulti = newModelFeatures.isMultimodal ?? newModelFeatures.isVision;

    const modelObj: WorkflowModel = {
      id,
      name,
      shortName: name.split(' ')[0],
      badge: '自定义',
      desc: newModelDesc.trim() || '用户自定义模型',
      isMultimodal: !!isMulti,
      isVision: !!isMulti,
      isAssistant: !!isMulti,
      isDistill: !!isMulti,
      isThinking: !!isMulti,
      isImage: newModelFeatures.isImage,
      isVideo: newModelFeatures.isVideo,
      isCustom: true,
    };

    onAdd(modelObj);
    onClose();
    setNewModelId('');
    setNewModelName('');
    setNewModelDesc('');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-3 backdrop-blur-[2px] animate-fade-in">
      <section role="dialog" aria-modal="true" aria-label="添加自定义大模型" className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]">
        <header className="flex shrink-0 items-center justify-between gap-5 border-b border-slate-100 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100"><Settings2 className="h-3.5 w-3.5 text-rose-500" /></span><h3 className="text-sm font-black tracking-tight">添加自定义大模型</h3></div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="关闭添加模型窗口">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4 text-xs sm:px-6">
          <div>
            <label className="font-bold text-slate-700 block mb-1">模型 ID (精确对应网关名称)</label>
            <input
              type="text"
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              placeholder="如: gpt-image-2-4k, image2-4k, flux-pro, doubao-seedream"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">显示名称</label>
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="如: Claude Opus 5 旗舰推理"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-indigo-500"
            />
          </div>

          {/* 能力勾选 */}
          <div className="space-y-1.5 pt-1">
            <label className="font-bold text-slate-700 block">该模型支持的核心能力</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isVision}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isVision: e.target.checked }))
                  }
                />
                <span>👁️ 视觉策划 (Step 2)</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isImage}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isImage: e.target.checked }))
                  }
                />
                <span>🎨 商业生图 (Step 3)</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isVideo}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isVideo: e.target.checked }))
                  }
                />
                <span>🎬 视频生成 (首页/视频)</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isAssistant}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isAssistant: e.target.checked }))
                  }
                />
                <span>💬 AI 助手对话</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isDistill}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isDistill: e.target.checked }))
                  }
                />
                <span>🔧 Skill 提炼架构</span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={newModelFeatures.isThinking}
                  onChange={(e) =>
                    setNewModelFeatures((p) => ({ ...p, isThinking: e.target.checked }))
                  }
                />
                <span>💡 深度思考/推理</span>
              </label>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            确认添加
          </button>
        </footer>
      </section>
    </div>
  );
}
