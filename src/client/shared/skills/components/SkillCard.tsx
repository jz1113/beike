import { Star, BookOpen } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SkillItem } from '../model/skillTypes';

interface SkillCardProps {
  skill: SkillItem;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onUseSkill: (skill: SkillItem) => void;
  onDetail: (skill: SkillItem) => void;
  onEdit: (skill: SkillItem) => void;
  onDelete: (skill: SkillItem) => void;
  onFeed: (skill: SkillItem) => void;
}

export function SkillCard({
  skill,
  isFavorite,
  onToggleFavorite,
  onUseSkill,
  onDetail, onEdit, onDelete, onFeed,
}: SkillCardProps) {

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl bg-transparent transition-all">
      {/* 封面缩略图容器 */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-white/[0.04]">
        <button type="button" onClick={() => onDetail(skill)} aria-label={`查看技能 ${skill.title}`} className="h-full w-full">
        {skill.coverUrl ? <img
          src={proxyMediaUrl(skill.coverUrl)}
          alt={skill.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        /> : <span className="flex h-full items-center justify-center text-slate-400"><BookOpen className="h-12 w-12" /></span>}
        </button>

        {/* 左上角 AI 生成/场景角标 */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-medium text-white select-none">
          <span>{skill.badge || 'AI生成'}</span>
        </div>

        {/* 右上角收藏星标按钮 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(skill.id);
          }}
          aria-label={isFavorite ? '取消收藏' : '收藏技能'}
          className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-colors cursor-pointer ${
            isFavorite
              ? 'bg-amber-400/90 text-white shadow-xs'
              : 'bg-black/30 text-white/80 hover:bg-black/50 hover:text-white'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* 底部信息与动作区 */}
      <div className="flex flex-col pt-2.5 pb-1">
        {/* 第一行：标题 + “使用”按钮 */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-bold text-slate-900 dark:text-white" title={skill.title}>
            {skill.title}
          </h3>
          <button
            type="button"
            onClick={() => onUseSkill(skill)}
            className="shrink-0 rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 px-3 py-1 text-[11px] font-semibold text-white dark:text-slate-900 shadow-2xs transition-all active:scale-95 cursor-pointer select-none"
          >
            {skill.runtime === 'workshop' ? '应用到工坊' : '在助手中使用'}
          </button>
        </div>

        {/* 第二行：模型标识 */}
        <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          {skill.category}{skill.libraryVersion ? ` · 版本 ${skill.libraryVersion.slice(0, 8)}` : ''}
        </div>

        {/* 第三行：描述 */}
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          {skill.description || '暂无详细描述'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          <button type="button" onClick={() => onDetail(skill)}>详情</button>
          <button type="button" onClick={() => onEdit(skill)}>{skill.runtime === 'workshop' ? '修订新版' : '编辑'}</button>
          {skill.runtime === 'workshop' && <button type="button" onClick={() => onFeed(skill)}>继续投喂</button>}
          <button type="button" onClick={() => onDelete(skill)} className="ml-auto">{skill.isOfficial ? '隐藏' : '删除'}</button>
        </div>
      </div>
    </div>
  );
}
