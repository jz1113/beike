import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Star,
  Plus,
  Check,
} from 'lucide-react';
import { useAppStore } from '@client/store';

export interface StoreSkillItem {
  id: string;
  title: string;
  models: string;
  category: string;
  description: string;
  tags: string[];
  coverUrl: string;
  isFavorite?: boolean;
}

export const STORE_SKILLS: StoreSkillItem[] = [
  {
    id: 'skill-mv',
    title: '音乐MV分镜创作',
    models: 'Seedance 2.5 · Seedream 5.0 Pro',
    category: '专业影视',
    description:
      '以音乐为核心驱动力的智能 MV 创作，上传歌曲或直接描述想要的创意，会先理解歌词、节奏、曲风、情绪和演唱阵容，再匹配视觉方向，生成人物设定与完整分镜确认。',
    tags: ['视频', '音乐MV'],
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-viral',
    title: '爆款复刻',
    models: 'SD 2.5 · Seedream 5.0 Pro',
    category: '营销广告',
    description:
      '解析参考视频的爆点原因并借鉴在视频中。精准拆解高热度爆款视频的画面运镜、构图与节奏，1:1 复刻创意结构并支持替换主体。',
    tags: ['爆款', '短片'],
    coverUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-ecommerce',
    title: '反转短剧带货视频',
    models: 'SD 2.0 Fast VIP · Seedream 5.0 Pro',
    category: '短剧漫剧',
    description:
      '为商品生成一支狗血反差和强反转爽点的短剧风格带货视频。打造戏剧性冲突与反转，自然植入商品提高转化率。',
    tags: ['短剧', '电商'],
    coverUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-knowledge',
    title: '知识讲解视频',
    models: 'GLM 5.1 · Seedance 2.5',
    category: '独家超创',
    description:
      '把科普知识通过动态视频、清晰配音和字幕，以直观易懂的方式表达。将长篇枯燥概念转化为生动的动态图解与视频叙事。',
    tags: ['科普', '图解'],
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-one-shot',
    title: '一镜到底',
    models: 'SD 2.0 Fast VIP',
    category: '专业影视',
    description:
      '一镜到底生成视频。贯穿整个场景的无缝镜头位移运镜，打造电影级别的空间穿梭与叙事张力。',
    tags: ['运镜', '长镜头'],
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'skill-pets',
    title: '《萌宠仙境》',
    models: 'Seedance 2.5 · FLUX Pro',
    category: '独家画风',
    description:
      '动物与机器人和谐共处·温暖复古未来主义·单元剧系列。专属奇幻柔光色彩与毛发渲染，生成如梦似幻的微短片。',
    tags: ['萌宠', '童话'],
    coverUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80',
  },
];

export const STORE_CATEGORIES = [
  '全部',
  '我的',
  '收藏',
  '专业影视',
  '营销广告',
  '短剧漫剧',
  '独家画风',
  '独家超创',
  'Skill大赛',
  '创意发散',
  '特效玩法',
  '社媒热点',
  '音乐MV',
];

interface PromptBarSkillStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseSkill: (skillTitle: string) => void;
  onOpenCreateMenu: () => void;
}

export default function PromptBarSkillStoreModal({
  isOpen,
  onClose,
  onUseSkill,
  onOpenCreateMenu,
}: PromptBarSkillStoreModalProps) {
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const customSkills = useAppStore((s) => s.assistantCustomSkills);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 混合官方预设与用户本地自定义技能
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="技能商店"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in select-none text-slate-900"
    >
      <div className="flex flex-col w-[1200px] max-w-[96vw] h-[86vh] max-h-[900px] rounded-[32px] bg-white border border-slate-200/90 shadow-[0_24px_64px_rgba(0,0,0,0.18)] overflow-hidden">
        {/* 顶部栏：左侧 ESC 关闭提示 + 搜索框 */}
        <div className="flex items-center justify-between px-7 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white text-[11px] font-mono font-medium transition-colors cursor-pointer"
            >
              <span>ESC</span>
              <span className="font-sans font-normal opacity-90">关闭</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/90 w-72 text-xs text-slate-700">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="搜索技能"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-0 focus:outline-none text-xs text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenCreateMenu}
              className="px-4 py-1.5 rounded-full bg-black hover:bg-slate-800 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建技能</span>
            </button>
          </div>
        </div>

        {/* 主体两栏结构（对齐图7） */}
        <div className="grid grid-cols-12 flex-1 min-h-0 divide-x divide-slate-100">
          {/* 左侧分类边栏 (col-span-2) */}
          <div className="col-span-2 p-4 space-y-1 overflow-y-auto">
            {STORE_CATEGORIES.map((cat) => {
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

          {/* 右侧技能卡片网格 (col-span-10) */}
          <div className="col-span-10 p-6 flex flex-col min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                技能商店
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                共 {filteredSkills.length} 个可用技能
              </span>
            </div>

            {filteredSkills.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400">
                暂无匹配的技能
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-5">
                {filteredSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex flex-col justify-between rounded-2xl bg-white border border-slate-200/80 p-3 hover:shadow-lg hover:border-slate-300 transition-all duration-200 group"
                  >
                    <div>
                      {/* 16:9 封面图 */}
                      <div className="w-full aspect-[16/9] rounded-xl overflow-hidden relative bg-slate-100">
                        <img
                          src={skill.coverUrl}
                          alt={skill.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(skill.id, e)}
                          className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                            favorites[skill.id]
                              ? 'bg-amber-400 text-white'
                              : 'bg-black/40 text-white/90 hover:text-white'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>

                      {/* 标题与模型 */}
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <h3 className="text-xs font-bold text-slate-900 truncate">
                          {skill.title}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            onUseSkill(skill.title);
                            onClose();
                          }}
                          className="px-3 py-1 rounded-full bg-slate-900 hover:bg-black text-white text-[11px] font-semibold transition-all shrink-0 active:scale-95 cursor-pointer shadow-xs"
                        >
                          使用
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">
                        {skill.models}
                      </div>

                      {/* 描述 */}
                      <p className="text-[11.5px] text-slate-600 line-clamp-2 mt-2 leading-relaxed">
                        {skill.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
