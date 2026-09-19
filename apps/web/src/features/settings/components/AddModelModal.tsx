import { useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 md:p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">添加自定义大模型</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
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

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-colors shadow-xs"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}
