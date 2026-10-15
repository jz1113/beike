import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Zap, LayoutGrid } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { densityComposerPill } from '@client/shared/ui/layoutClasses';

interface PromptBarAgentControlsProps {
  isUp: boolean;
}

const PREFERENCE_OPTIONS = [
  { id: 'balanced', label: '通用创作' },
  { id: 'creative', label: '创意发散' },
  { id: 'precise', label: '严谨分析' },
  { id: 'script', label: '分镜提示词' },
];

const AGENT_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek Flash', badge: '推荐' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', badge: '多模态' },
  { id: 'gpt-4o', name: 'GPT-4o', badge: '通用' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', badge: '高级推理' },
];

export const PromptBarAgentControls = React.memo(function PromptBarAgentControls({
  isUp,
}: PromptBarAgentControlsProps) {
  const {
    activeSkillId,
    setActiveSkillId,
    getAllSkills,
    assistantModel,
    setAssistantModel,
  } = useAppStore(
    useShallow((s) => ({
      activeSkillId: s.activeAssistantSkillId,
      setActiveSkillId: s.setActiveAssistantSkillId,
      getAllSkills: s.getAllAssistantSkills,
      assistantModel: s.assistantModel,
      setAssistantModel: s.setAssistantModel,
    })),
  );

  const [skillsOpen, setSkillsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);
  const [activePref, setActivePref] = useState('balanced');

  const skillsRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const prefRef = useRef<HTMLDivElement>(null);

  const skills = getAllSkills();
  const currentSkill = skills.find((s) => s.id === activeSkillId);
  const activePrefObj = PREFERENCE_OPTIONS.find((p) => p.id === activePref) || PREFERENCE_OPTIONS[0];
  const activeModelObj = AGENT_MODELS.find((m) => m.id === assistantModel) || AGENT_MODELS[0];

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (skillsRef.current && !skillsRef.current.contains(target)) setSkillsOpen(false);
      if (modelRef.current && !modelRef.current.contains(target)) setModelOpen(false);
      if (prefRef.current && !prefRef.current.contains(target)) setPrefOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {/* 1. 技能选择胶囊 (图2: ⚡ 技能 ˇ) */}
      <div className="relative" ref={skillsRef}>
        <button
          type="button"
          onClick={() => {
            setSkillsOpen((prev) => !prev);
            setModelOpen(false);
            setPrefOpen(false);
          }}
          className={`${densityComposerPill} rounded-2xl font-medium flex items-center gap-1.5 transition-all cursor-pointer border-0 shrink-0 ${
            activeSkillId
              ? 'bg-amber-50 text-amber-900 font-semibold'
              : 'bg-transparent hover:bg-slate-50 text-slate-700'
          }`}
          title={currentSkill ? `当前技能：${currentSkill.displayName || currentSkill.name}` : '选择创作技能'}
        >
          <Zap className={`w-3.5 h-3.5 ${activeSkillId ? 'text-amber-500 fill-amber-500' : 'text-slate-600'}`} />
          <span className="text-xs sm:text-[13px] truncate max-w-[100px]">
            {currentSkill ? (currentSkill.displayName || currentSkill.name) : '技能'}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {skillsOpen && (
          <div
            className={`absolute left-0 ${
              isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
            } w-52 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left`}
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">选择 Agent 技能</div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveSkillId(null);
                  setSkillsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                  !activeSkillId ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>无特定技能（通用助手）</span>
                {!activeSkillId && <Check className="w-3.5 h-3.5 text-slate-900" />}
              </button>
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => {
                    setActiveSkillId(skill.id);
                    setSkillsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    activeSkillId === skill.id ? 'bg-amber-50 font-bold text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{skill.displayName || skill.name}</span>
                  {activeSkillId === skill.id && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. 自定义模型 与 创作偏好 组合胶囊 (图2: ⁙ 自定义模型 | 创作偏好 ˇ) */}
      <div className="inline-flex items-center rounded-2xl bg-transparent hover:bg-slate-50 transition-colors border-0">
        {/* 自定义模型 */}
        <div className="relative" ref={modelRef}>
          <button
            type="button"
            onClick={() => {
              setModelOpen((prev) => !prev);
              setSkillsOpen(false);
              setPrefOpen(false);
            }}
            className={`${densityComposerPill} rounded-2xl font-medium flex items-center gap-1.5 transition-all cursor-pointer border-0 shrink-0 text-slate-700`}
            title={`当前模型：${activeModelObj.name}`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-xs sm:text-[13px]">{activeModelObj.name || '自定义模型'}</span>
          </button>

          {modelOpen && (
            <div
              className={`absolute left-0 ${
                isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
              } w-52 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left`}
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">选择推理大模型</div>
              <div className="space-y-0.5">
                {AGENT_MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setAssistantModel(model.id);
                      setModelOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      assistantModel === model.id ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{model.name}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{model.badge}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 创作偏好 */}
        <div className="relative" ref={prefRef}>
          <button
            type="button"
            onClick={() => {
              setPrefOpen((prev) => !prev);
              setSkillsOpen(false);
              setModelOpen(false);
            }}
            className={`${densityComposerPill} rounded-2xl font-medium flex items-center gap-1 transition-all cursor-pointer border-0 shrink-0 text-slate-600 hover:text-slate-900`}
            title={`创作偏好：${activePrefObj.label}`}
          >
            <span className="text-xs sm:text-[13px]">{activePrefObj.label}</span>
            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
          </button>

          {prefOpen && (
            <div
              className={`absolute left-0 ${
                isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
              } w-40 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left`}
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">创作风格偏好</div>
              <div className="space-y-0.5">
                {PREFERENCE_OPTIONS.map((pref) => (
                  <button
                    key={pref.id}
                    type="button"
                    onClick={() => {
                      setActivePref(pref.id);
                      setPrefOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      activePref === pref.id ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{pref.label}</span>
                    {activePref === pref.id && <Check className="w-3.5 h-3.5 text-slate-900" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
