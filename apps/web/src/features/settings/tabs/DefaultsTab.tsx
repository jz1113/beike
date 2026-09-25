import { Bot, Palette, Video, Info } from 'lucide-react';
import { getEnabledMultimodalModelsFromSettings, getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings, setStoredMultimodalModelId } from '@beike/domain/workflowModels';
import { MULTIMODAL_UPSTREAM_FALLBACK_ORDER } from '@beike/domain/modelCatalog';
import { channelName, modelChannel } from '../modelManagement';
import type { WorkflowModel } from '../settingsShared';

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
    { id: 'multimodal', title: '默认视觉分析 / 分镜模型', desc: '保存完整渠道线路；Responses 模型不会覆盖 AI 助手的独立选择。', icon: Bot,
      value: props.activeVisionModel, models: getEnabledMultimodalModelsFromSettings(customModels),
      save: (id: string) => {
        if (!setStoredMultimodalModelId(id)) throw new Error('默认模型保存失败');
        props.setActiveVisionModel(id); props.setSelectedVisionModel(id);
        if (!id.startsWith('openai-responses:')) props.setActiveAssistantModel(id);
      } },
    { id: 'image', title: '默认商业生图模型', desc: '用于支持全局默认值的生图入口；业务内已选定的模型不被强制覆盖。', icon: Palette,
      value: props.activeImageGenModel, models: options(imageIds),
      save: (id: string) => { localStorage.setItem('ai_image_gen_model', id); props.setActiveImageGenModel(id); props.setSelectedImageGenModel(id); } },
    { id: 'video', title: '默认视频生成模型', desc: '用于视频入口的默认选择；已有任务仍沿用创建时的模型。', icon: Video,
      value: props.activeVideoGenModel, models: options(videoIds),
      save: (id: string) => { localStorage.setItem('ai_video_gen_model', id); props.setActiveVideoGenModel(id); props.setQuickVideoModel(id); } },
  ];
  return <div className="space-y-5 max-w-5xl mx-auto">
    <header><h2 className="text-base font-bold text-slate-900">默认模型与调用规则</h2><p className="text-xs text-slate-500 mt-2">默认线路与模型列表展示顺序独立。选择前请在渠道管理中保存凭证并测试接口。</p></header>
    <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
      {cards.map(card => {
        const valid = card.models.some(model => model.id === card.value);
        const Icon = card.icon;
        return <section key={card.id} className="p-5 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex gap-3 items-start"><span className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><Icon className="w-4 h-4" /></span><div><h3 className="text-sm font-semibold text-slate-800">{card.title}</h3><p className="text-xs text-slate-500 mt-1.5 leading-5">{card.desc}</p></div></div>
            <select aria-label={card.title} value={valid ? card.value : ''} disabled={!card.models.length}
              onChange={event => { try { card.save(event.target.value); notifyModelsUpdated(); showToast('默认模型已保存，展示排序保持不变'); } catch { showToast('保存失败，请检查浏览器存储空间后重试'); } }}
              className="w-full xl:w-80 shrink-0 max-w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-60">
              {!valid && <option value="" disabled>{card.models.length ? '当前默认线路不可用，请重新选择' : '没有已启用的受支持模型'}</option>}
              {card.models.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
            </select>
          </div>
          {!valid && <p role="alert" className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg leading-5">原默认值：<code className="break-all">{card.value || '未设置'}</code>。该线路已停用、移出或不受此业务支持。原选择未被静默覆盖，请启用线路或明确选择替代模型。</p>}
        </section>;
      })}
    </div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Info className="w-4 h-4 text-indigo-600" />当前故障处理规则 <span className="text-[10px] font-normal text-slate-500">只读 · 由后端执行</span></h3>
      <div className="grid sm:grid-cols-2 gap-4 text-xs leading-6 text-slate-600">
        <div><h4 className="font-semibold text-slate-800">Comfly 多模态</h4><p>部分分析、助手与文案接口使用后端内置降级序列；从请求模型开始，是否重试由对应接口判断。该序列不等同于本地模型列表，停用选择器条目不修改后端降级池。</p></div>
        <div><h4 className="font-semibold text-slate-800">独立渠道与生成任务</h4><p>Responses 分析通道使用指定模型，不自动切换到 Comfly。生图、视频沿用各自的错误恢复与任务核对逻辑，不在这里增加可能造成重复扣费的自动重提。</p></div>
      </div>
      <details className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium">查看内置多模态降级序列</summary><ol className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 list-decimal list-inside font-mono text-[11px] break-all">{MULTIMODAL_UPSTREAM_FALLBACK_ORDER.map(id => <li key={id}>{id}</li>)}</ol></details>
      <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">当前不提供未接入执行链路的“跨渠道自动回退”开关。新增自定义备用策略需要同步改造对应后端接口，不能仅靠拖动模型列表生效。</p>
    </section>
  </div>;
}
