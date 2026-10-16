import { useState, useRef, useEffect, type RefObject, type ChangeEvent } from 'react';
import {
  Search,
  Star,
  ArrowRight,
  Check,
  CornerDownLeft,
  ScanLine,
} from 'lucide-react';
import { STORE_SKILLS, type StoreSkillItem } from './PromptBarSkillStoreModal';
import { useAppStore } from '@client/store';

const SKILL_CATEGORIES = [
  '全部',
  '我的',
  '收藏',
  '专业影视',
  '营销广告',
  '短剧漫剧',
  '独家画风',
  '独家超创',
];

interface PromptBarSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  onShowToast?: (msg: string) => void;
  isUp?: boolean;
  onUseSkill: (skillTitle: string) => void;
  onOpenStore: () => void;
  onAgentCreate: () => void;
  onManualCreate: () => void;
}

export default function PromptBarSkillsModal({
  isOpen,
  onClose,
  triggerRef,
  onShowToast,
  isUp = true,
  onUseSkill,
  onOpenStore,
  onAgentCreate,
  onManualCreate,
}: PromptBarSkillsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSkillId, setActiveSkillId] = useState<string>('skill-mv');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const customSkills = useAppStore((s) => s.assistantCustomSkills);

  useEffect(() => {
    if (!isOpen) {
      setShowCreateMenu(false);
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        modalRef.current &&
        !modalRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const allSkills: StoreSkillItem[] = [
    ...customSkills.map((cs) => ({
      id: cs.id,
      title: cs.displayName || cs.name,
      models: '平台自适应',
      category: '我的',
      description: cs.description || '自定义技能',
      tags: ['我的技能'],
      coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    })),
    ...STORE_SKILLS,
  ];

  const filteredSkills = allSkills.filter((s) => {
    if (selectedCategory === '我的') {
      return s.category === '我的';
    }
    if (selectedCategory === '收藏') {
      return favorites[s.id];
    }
    if (selectedCategory !== '全部' && s.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.models.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeSkill = allSkills.find((s) => s.id === activeSkillId) || allSkills[0];

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectAndUse = (skill: StoreSkillItem) => {
    onUseSkill(skill.title);
    onClose();
  };

  const handleUploadLocalSkill = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const store = useAppStore.getState();
      const now = Date.now();
      const newSkill = {
        id: `local-skill-${now}`,
        name: fileNameWithoutExt,
        displayName: fileNameWithoutExt,
        description: `从本地导入的技能：${file.name}`,
        prompt: text,
        markdownDoc: text,
        author: '本地导入',
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      };
      store.addAssistantSkill(newSkill);
      onShowToast?.(`已成功导入本地技能「${fileNameWithoutExt}」`);
      onUseSkill(fileNameWithoutExt);
      setShowCreateMenu(false);
      onClose();
    };
    reader.readAsText(file);
  };

  return (
    <div
      ref={modalRef}
      className={`absolute left-1/2 -translate-x-1/2 ${
        isUp ? 'bottom-full mb-2.5 origin-bottom' : 'top-full mt-2.5 origin-top'
      } w-[780px] max-w-[calc(100vw-2rem)] rounded-3xl bg-white/98 backdrop-blur-2xl border border-slate-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.16)] p-4 z-50 animate-fade-in text-left select-none text-slate-900`}
    >
      <input
        type="file"
        ref={uploadFileInputRef}
        onChange={handleUploadLocalSkill}
        accept=".md,.json,.txt"
        className="hidden"
      />

      {/* 🌟 顶部栏：搜索框 + 全部 ->（图4） */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100/90 w-64 text-xs text-slate-700">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="搜索技能"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 focus:outline-none text-xs text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStore();
          }}
          className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-medium transition-colors cursor-pointer group"
        >
          <span>全部</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* 🌟 主体三栏结构（图4） */}
      <div className="grid grid-cols-12 gap-3.5 pt-3">
        {/* 左栏：分类导航 (col-span-3) */}
        <div className="col-span-3 border-r border-slate-100 pr-2 space-y-1">
          {SKILL_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'text-slate-950 font-bold bg-slate-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {isSelected ? (
                  <Check className="w-3 h-3 text-slate-900 stroke-[2.5]" />
                ) : (
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                )}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        {/* 中栏：技能卡片列表 (col-span-4) */}
        <div className="col-span-4 space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
          {filteredSkills.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              暂无匹配技能
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const isActive = activeSkill.id === skill.id;
              return (
                <div
                  key={skill.id}
                  onClick={() => setActiveSkillId(skill.id)}
                  onDoubleClick={() => handleSelectAndUse(skill)}
                  className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-slate-300 bg-slate-100/80 shadow-2xs'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 line-clamp-1">
                      {skill.title}
                    </span>
                    {isActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAndUse(skill);
                        }}
                        title="使用此技能"
                        className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 transition-colors"
                      >
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-1 font-mono">
                    {skill.models}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* 右栏：当前技能详情预览卡片 (col-span-5) */}
        <div className="col-span-5 flex flex-col justify-between rounded-2xl bg-slate-50/80 p-3 border border-slate-100 relative">
          <div>
            {/* 封面图片 */}
            <div className="w-full h-36 rounded-xl overflow-hidden relative shadow-sm bg-slate-200">
              <img
                src={activeSkill.coverUrl}
                alt={activeSkill.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
                <span className="text-white text-sm font-bold tracking-tight drop-shadow-md">
                  《{activeSkill.title}》
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => toggleFavorite(activeSkill.id, e)}
                className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                  favorites[activeSkill.id]
                    ? 'bg-amber-400 text-white'
                    : 'bg-black/40 text-white/90 hover:text-white'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* 说明正文 */}
            <p className="text-[11.5px] text-slate-600 leading-relaxed mt-2.5 line-clamp-3">
              {activeSkill.description}
            </p>

            {/* 标签 */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {activeSkill.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10.5px] text-slate-600 font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* 底部按钮栏（图4、图6） */}
          <div className="pt-3 mt-2 border-t border-slate-200/60 flex items-center justify-between relative">
            <button
              type="button"
              onClick={() => handleSelectAndUse(activeSkill)}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer flex items-center gap-1"
            >
              <span>详情</span>
              <ArrowRight className="w-3 h-3" />
            </button>

            {/* 创建技能按钮与展开气泡菜单（图6） */}
            <div className="relative">
              <button
                ref={createButtonRef}
                type="button"
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className="px-3 py-1.5 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-medium flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>创建技能</span>
              </button>

              {/* 🌟 图6：点击创建技能后弹出的菜单气泡 */}
              {showCreateMenu && (
                <div
                  className="absolute bottom-full mb-2 right-0 w-44 rounded-2xl bg-white border border-slate-200/90 shadow-[0_12px_32px_rgba(0,0,0,0.18)] p-2 z-50 animate-fade-in text-left space-y-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateMenu(false);
                      onClose();
                      onAgentCreate();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs text-slate-700 hover:text-slate-950 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>通过Agent创建</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      uploadFileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs text-slate-700 hover:text-slate-950 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>上传本地Skill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateMenu(false);
                      onClose();
                      onManualCreate();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs text-slate-700 hover:text-slate-950 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer text-left"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>手动创建Skill</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
