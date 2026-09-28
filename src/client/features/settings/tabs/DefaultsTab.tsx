import { Bot, Palette, Video } from 'lucide-react';
import { getEnabledMultimodalModelsFromSettings, getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings, setStoredMultimodalModelId } from '@shared/domain/models/workflowModels';
import { FallbackOrderEditor } from '../components/FallbackOrderEditor';
import { channelName, modelChannel } from '../model/modelManagement';
import type { WorkflowModel } from '../components/settingsShared';

export interface DefaultsTabProps {
  customModels: WorkflowModel[];
  activeVisionModel: string;
  setActiveVisionModel: (v: string) => void;
  setActiveAssistantModel: (v: string) => void;
  setSelectedVisionModel: (v: string) => void;
  activeImageGenModel: string;
  setActiveImageGenModel: (v: string) => void;
  setSelectedImageGenModel: (v: string) => void;
  activeVideoGenModel: string;
  setActiveVideoGenModel: (v: string) => void;
  setQuickVideoModel: (v: string) => void;
  notifyModelsUpdated: () => void;
  showToast: (msg: string) => void;
}

export default function DefaultsTab(props: DefaultsTabProps) {
  const { customModels, notifyModelsUpdated, showToast } = props;
  const imageIds = new Set(getEnabledImageModelsFromSettings(customModels).map(model => model.id));
  const videoIds = new Set(getEnabledVideoModelsFromSettings(customModels).map(model => model.id));
  const options = (ids: Set<unknown>) => customModels.filter(model => model.enabled !== false && ids.has(model.id)).map(model => ({ id: model.id, name: `${model.name || model.id} · ${channelName(modelChannel(model))}` }));
  const cards = [
    { id: 'multimodal', title: '默认视觉分析 / 分镜模型', desc: '用于图片理解与分镜分析。', icon: Bot,
      value: props.activeVisionModel, models: getEnabledMultimodalModelsFromSettings(customModels),
      save: (id: string) => {
        if (!setStoredMultimodalModelId(id)) throw new Error('默认模型保存失败');
        props.setActiveVisionModel(id); props.setSelectedVisionModel(id);
        if (!id.startsWith('openai-responses:')) props.setActiveAssistantModel(id);
      } },
    { id: 'image', title: '默认商业生图模型', desc: '用于新建生图任务，已有选择不受影响。', icon: Palette,
      value: props.activeImageGenModel, models: options(imageIds),
      save: (id: string) => { localStorage.setItem('ai_image_gen_model', id); props.setActiveImageGenModel(id); props.setSelectedImageGenModel(id); } },
    { id: 'video', title: '默认视频生成模型', desc: '用于新建视频任务，已有任务不受影响。', icon: Video,
      value: props.activeVideoGenModel, models: options(videoIds),
      save: (id: string) => { localStorage.setItem('ai_video_gen_model', id); props.setActiveVideoGenModel(id); props.setQuickVideoModel(id); } },
  ];
  return <div className="settings-defaults-page space-y-6 w-full">
    <header><h2 className="text-base font-bold text-slate-900">新任务默认模型</h2><p className="text-xs text-slate-500 mt-2">选择新任务默认使用的模型，修改后自动保存。</p></header>
    <div className="settings-default-grid">
      {cards.map(card => {
        const valid = card.models.some(model => model.id === card.value);
        const Icon = card.icon;
        return <section key={card.id} className="settings-default-card">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex gap-3 items-start"><span className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><Icon className="w-4 h-4" /></span><div><h3 className="text-sm font-semibold text-slate-800">{card.title}</h3><p className="text-xs text-slate-500 mt-1.5 leading-5">{card.desc}</p></div></div>
            <select aria-label={card.title} value={valid ? card.value : ''} disabled={!card.models.length}
              onChange={event => { try { card.save(event.target.value); notifyModelsUpdated(); showToast('默认模型已保存'); } catch { showToast('保存失败，请检查浏览器存储空间后重试'); } }}
              className="w-full xl:w-80 shrink-0 max-w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-60">
              {!valid && <option value="" disabled>{card.models.length ? '当前默认线路不可用，请重新选择' : '没有已启用的受支持模型'}</option>}
              {card.models.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
            </select>
          </div>
          {!valid && <p role="alert" className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg leading-5">原默认值：<code className="break-all">{card.value || '未设置'}</code> 不可用，请在模型管理中启用受支持的线路，或重新选择。</p>}
        </section>;
      })}
    </div>
    <FallbackOrderEditor showToast={showToast} customModels={customModels} />
  </div>;
}
