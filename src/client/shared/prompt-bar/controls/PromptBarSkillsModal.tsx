import { useState, useRef, useEffect, type RefObject } from 'react';
import {
  Search,
  Star,
  Plus,
  ArrowRight,
  Check,
} from 'lucide-react';

interface SkillItem {
  id: string;
  title: string;
  models: string;
  category: string;
  description: string;
  tags: string[];
  coverUrl?: string;
  isFavorite?: boolean;
}

const DEMO_SKILLS: SkillItem[] = [
  {
    id: 'skill-mv',
    title: '音乐MV分镜创作',
    models: 'Seedance 2.5 · Seedream 5.0 Pro',
    category: '专业影视',
    description:
      '以音乐为核心驱动力的智能 MV 创作，上传歌曲或直接描述想要的创意，会先理解歌词、节奏、曲风、情绪和演唱阵容，再匹配视觉方向，生成人物设定与完整分镜供确认。',
    tags: ['视频', '音乐MV'],
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-viral',
    title: '爆款复刻',
    models: 'SD 2.5 · Seedream 5.0 Pro',
    category: '营销广告',
    description:
      '精准拆解高热度爆款视频的画面运镜、构图与镜头转换节奏，1:1 复刻创意结构并支持替换主体与风格。',
    tags: ['爆款', '短片'],
    coverUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-ecommerce',
    title: '反转短剧带货视频',
    models: 'SD 2.0 Fast VIP · Seedream 5.0 F',
    category: '短剧漫剧',
    description:
      '打造戏剧性冲突与剧情反转，巧妙自然地将商品植入剧情高潮，提高完播率与转化率。',
    tags: ['短剧', '电商'],
    coverUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-knowledge',
    title: '知识讲解视频',
    models: 'GLM 5.1 · Seedance 2.5',
    category: '独家超创',
    description:
      '将枯燥的概念与长篇科普转化为生动具象的动态图解与视频叙事，配以高质感视觉与字幕。',
    tags: ['科普', '图解'],
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-pets',
    title: '《萌宠仙境》',
    models: 'Seedance 2.5 · FLUX Pro',
    category: '独家画风',
    description:
      '超萌拟人化宠物奇幻冒险世界，专属奇幻柔光色彩与毛发渲染，生成如梦似幻的童话微短片。',
    tags: ['萌宠', '童话'],
    coverUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80',
  },
];

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
}

export default function PromptBarSkillsModal({
  isOpen,
  onClose,
  triggerRef,
  onShowToast,
  isUp = true,
}: PromptBarSkillsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSkillId, setActiveSkillId] = useState<string>('skill-mv');

  useEffect(() => {
    if (!isOpen) return;
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

  const filteredSkills = DEMO_SKILLS.filter((s) => {
    if (selectedCategory !== '全部' && s.category !== selectedCategory) {
      if (selectedCategory === '我的' || selectedCategory === '收藏') {
        return false;
      }
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

  const activeSkill = DEMO_SKILLS.find((s) => s.id === activeSkillId) || DEMO_SKILLS[0];

  const handleUnderDevelopmentNotice = () => {
    onShowToast?.('当前技能正在规划开发中，敬请期待');
  };

  return (
    <div
      ref={modalRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
      } w-[760px] max-w-[calc(100vw-2rem)] rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-4 z-50 animate-fade-in text-left select-none`}
    >
      {/* 🌟 顶部栏：搜索框 + 全部 -> */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 w-64 text-xs text-slate-700">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="搜索技能"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 focus:outline-none text-xs text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* 🌟 核心要求：当前没有技能，标为待开发 */}
          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/70 text-amber-700 text-[11px] font-medium">
            技能生态 · 待开发
          </span>
          <button
            type="button"
            onClick={handleUnderDevelopmentNotice}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors cursor-pointer"
          >
            <span>全部</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 🌟 主体两栏结构（1:1 还原图5） */}
      <div className="grid grid-cols-12 gap-3 pt-3">
        {/* 左侧分类导航 */}
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
                    ? 'text-slate-950 font-bold bg-slate-100/90'
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

        {/* 中间技能列表 */}
        <div className="col-span-4 space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
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
                  className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-slate-300 bg-slate-50/90 shadow-2xs'
                      : 'border-transparent hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 line-clamp-1">
                      {skill.title}
                    </span>
                    <span className="px-1.5 py-0.2 text-[9px] rounded bg-slate-200/80 text-slate-500 font-normal shrink-0">
                      待开发
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-1 font-mono">
                    {skill.models}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧技能卡片详情（图5同款封面与预览） */}
        <div className="col-span-5 flex flex-col justify-between rounded-2xl bg-slate-50/70 p-3 border border-slate-100 relative">
          <div>
            {/* 封面图片 */}
            <div className="w-full h-36 rounded-xl overflow-hidden relative shadow-sm bg-slate-200">
              <img
                src={activeSkill.coverUrl}
                alt={activeSkill.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
                <span className="text-white text-base font-bold tracking-tight drop-shadow-md">
                  《{activeSkill.title}》
                </span>
              </div>
              <button
                type="button"
                onClick={handleUnderDevelopmentNotice}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white/90 hover:text-white backdrop-blur-sm cursor-pointer"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 说明正文 */}
            <p className="text-[11.5px] text-slate-600 leading-relaxed mt-2.5 line-clamp-3">
              {activeSkill.description}
            </p>

            {/* 标签 */}
            <div className="flex items-center gap-1.5 mt-2">
              {activeSkill.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200/80 text-[10.5px] text-slate-600 font-medium"
                >
                  {t}
                </span>
              ))}
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10.5px] font-medium ml-auto">
                待开发
              </span>
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="pt-3 mt-2 border-t border-slate-200/60 flex items-center justify-between">
            <button
              type="button"
              onClick={handleUnderDevelopmentNotice}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              详情 ↗
            </button>
            <button
              type="button"
              onClick={handleUnderDevelopmentNotice}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建技能</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
