import { deepSeekRouteId, deepSeekModelId } from '@shared/domain/models/deepseek';
import { useState } from 'react';
import { X } from 'lucide-react';
import { gatewayModelToWorkflowModel, workflowModelRouteId, repairWorkflowModelId } from '@shared/domain/models/workflowModels';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { MODEL_CHANNELS, type ModelChannel } from '../model/modelManagement';
import type { WorkflowModel } from './settingsShared';
import { useSettingsDialogFocus } from '../hooks/useSettingsDialogFocus';

export default function AddModelModal({ initialChannel, onClose, onAdd, existingRouteIds }: {
  initialChannel: ModelChannel; onClose: () => void;
  onAdd: (model: WorkflowModel) => boolean;
  existingRouteIds?: Set<string>;
}) {
  const dialogRef = useSettingsDialogFocus<HTMLFormElement>(true, onClose);
  const [channel, setChannel] = useState<ModelChannel>(initialChannel);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const approved = getApprovedModel(channel === 'deepseek' ? deepSeekRouteId(id.trim()) : id.trim());
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!id.trim()) { setError('请填写上游模型 ID'); return; }
    if (!approved) { setError('此 ID 尚未纳入业务支持目录。请通过“发现渠道模型”选择受支持的模型，避免接入后无法调用。'); return; }
    if (channel === 'openai' && approved.capability !== 'multimodal') { setError('当前 Responses 适配器仅接入多模态模型；生图和视频请选择受支持的渠道。'); return; }
    if ((channel === 'lianchi') !== (approved.id === 'openai/gpt-image-2')) { setError('联池图像适配器当前仅支持 openai/gpt-image-2，该模型也需通过联池渠道接入。'); return; }
    const model = { ...gatewayModelToWorkflowModel({ id: channel === 'deepseek' ? deepSeekModelId(approved.id) : repairWorkflowModelId(id.trim()), name: name.trim() || approved.name }, channel), enabled: true, isCustom: true } as WorkflowModel;
    if (existingRouteIds?.has(workflowModelRouteId(model))) { setError('该渠道已有此模型线路，可在模型管理中启用。'); return; }
    if (onAdd(model)) onClose();
    else setError('未能添加：该渠道已有此模型，或浏览器存储失败。请检查已有线路及保存提示。');
  };
  const inputClass = 'w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-500';
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm" >
    <form ref={dialogRef} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-model-title" className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
      <header className="p-5 border-b border-slate-100 flex justify-between items-center"><h2 id="add-model-title" className="font-bold">添加模型线路</h2><button type="button" aria-label="关闭添加模型" onClick={onClose}><X className="w-4 h-4" /></button></header>
      <div className="p-5 space-y-4">
        <label className="block text-xs font-semibold text-slate-600">所属渠道<select data-initial-focus value={channel} onChange={event => { setChannel(event.target.value as ModelChannel); setError(''); }} className={inputClass}>{MODEL_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-xs font-semibold text-slate-600">上游模型 ID<input value={id} onChange={event => { setId(event.target.value); setError(''); }} placeholder={channel === 'lianchi' ? 'openai/gpt-image-2' : '精确填写渠道返回的模型 ID'} className={`${inputClass} font-mono`} /></label>
        <label className="block text-xs font-semibold text-slate-600">显示名称（可选）<input value={name} onChange={event => setName(event.target.value)} placeholder={approved?.name || '默认使用目录名称'} className={inputClass} /></label>
        <p className="text-xs text-slate-500 leading-6">同名模型可以分别接入不同渠道。能力由支持目录识别，不通过勾选声明接口不支持的能力。添加模型不会修改渠道地址或密钥；尚未设置默认线路时，将使用首个已启用模型。</p>
        {approved && <p className="text-xs text-indigo-600">已识别能力：{approved.capability === 'multimodal' ? '多模态' : approved.capability === 'image' ? '生图' : '视频'}</p>}
        {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      </div>
      <footer className="p-4 bg-slate-50 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs text-slate-600">取消</button><button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">添加线路</button></footer>
    </form>
  </div>;
}
