import { useState } from 'react';
import { AudioLines, Copy, FileText, Film, Image as ImageIcon, MoreHorizontal, PenLine, Star, Trash2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useMediaQuery } from '@client/shared/hooks/useMediaQuery';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import LazyVideoCover from '@client/shared/media/widgets/LazyVideoCover';
import type { SkillItem } from '../model/skillTypes';

/** Show real preview art when available; imported skills without art use a restrained type cover. */
export function SkillCover({ skill }: { skill: SkillItem }) {
  const [failed, setFailed] = useState<string | null>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const cover = skill.coverUrl || skill.showcaseUrls?.[0];
  if (isVideoMediaUrl(cover)) {
    return <LazyVideoCover src={proxyMediaUrl(cover, { asVideo: true })} poster={skill.coverPosterUrl} objectFit={skill.coverFit || 'cover'} autoPlay={!reducedMotion} />;
  }
  if (cover && cover !== failed) {
    return (
      <img
        src={proxyMediaUrl(cover)}
        alt={`${skill.title} 预览`}
        loading="lazy"
        onError={() => setFailed(cover)}
        className={`h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none ${skill.coverFit === 'contain' ? 'bg-[#f2f2f2] object-contain' : 'object-cover group-hover:scale-[1.03] motion-reduce:group-hover:scale-100'}`}
      />
    );
  }
  const genre = skill.genres?.[0] || (skill.runtime === 'workshop' ? '图片' : '视频');
  const Icon = { 视频: Film, 图片: ImageIcon, 音频: AudioLines, 文本: FileText }[genre];
  return (
    <div className="relative flex h-full w-full flex-col items-start justify-end overflow-hidden bg-slate-100 p-5 text-slate-600 dark:bg-[#202224] dark:text-neutral-300">
      <Icon aria-hidden="true" size={44} strokeWidth={1} className="absolute right-5 top-5 text-slate-300 dark:text-white/10" />
      <span className="text-[10px] tracking-[0.16em] text-slate-400 dark:text-neutral-500">{genre} · SKILL</span>
      <span className="mt-2 max-w-full truncate text-left text-lg font-medium">{skill.title}</span>
    </div>
  );
}

interface Props {
  skill: SkillItem;
  isFavorite?: boolean;
  compact?: boolean;
  onToggleFavorite?: (id: string) => void;
  onUseSkill: (skill: SkillItem, example?: boolean) => void;
  onDetail: (skill: SkillItem) => void;
  onEdit: (skill: SkillItem) => void;
  onDelete: (skill: SkillItem) => void;
  onFeed: (skill: SkillItem) => void;
  onDuplicate?: (skill: SkillItem) => void;
}

export function SkillCard({
  skill,
  isFavorite = false,
  compact = false,
  onToggleFavorite,
  onUseSkill,
  onDetail,
  onEdit,
  onDelete,
  onFeed,
  onDuplicate,
}: Props) {
  const canDuplicate = !compact && onDuplicate && skill.runtime === 'assistant';
  const editable = (!skill.isOfficial && !skill.isBuiltin) || skill.runtime === 'workshop';
  const hasMenu = editable || canDuplicate;
  const mediaLabel = skill.genres?.join(' / ') || (skill.runtime === 'workshop' ? '图片' : '创作');

  return (
    <article className="group flex min-w-0 flex-col">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-[#202020]">
        <button
          type="button"
          onClick={() => onDetail(skill)}
          aria-label={`查看技能 ${skill.title}`}
          className="absolute inset-0 block h-full w-full cursor-pointer overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-500"
        >
          <SkillCover skill={skill} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-80 transition-opacity group-hover:opacity-95"
          />
        </button>

        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/95 backdrop-blur-md">
          {mediaLabel}
        </span>

        {(hasMenu || onToggleFavorite) && (
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
            {onToggleFavorite && <button type="button" onClick={() => onToggleFavorite(skill.id)}
              aria-label={`${isFavorite ? '取消收藏' : '收藏技能'} ${skill.title}`} aria-pressed={isFavorite}
              className="order-last flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-md transition-colors hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-white">
              <Star size={15} className={isFavorite ? 'fill-white' : ''} />
            </button>}
            {hasMenu && (
            <details className="relative opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [&[open]]:opacity-100">
              <summary
                aria-label={`${skill.title} 更多操作`}
                className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-md transition hover:bg-black/55 [&::-webkit-details-marker]:hidden"
              >
                <MoreHorizontal size={14} />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1.5 min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#252830]">
                {canDuplicate && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      onDuplicate(skill);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    <Copy size={13} />
                    复制为我的技能
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => onEdit(skill)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    <PenLine size={13} />
                    {skill.runtime === 'workshop' ? '修订技能' : '编辑技能'}
                  </button>
                )}
                {skill.runtime === 'workshop' && (
                  <button
                    type="button"
                    onClick={() => onFeed(skill)}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    补充参考图
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => onDelete(skill)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 size={13} />
                    {skill.isOfficial ? '隐藏技能' : '删除技能'}
                  </button>
                )}
              </div>
            </details>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'pt-2' : 'pt-3'}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onDetail(skill)}
              className="block w-full cursor-pointer truncate text-left text-[14px] font-medium leading-snug text-slate-900 transition-colors hover:text-slate-600 dark:text-slate-100 dark:hover:text-white/70"
            >
              {skill.title}
            </button>
          </h3>

          {!compact && skill.example && <button type="button" onClick={() => onUseSkill(skill, true)} aria-label={`使用示例 ${skill.title}`} className="shrink-0 rounded-full px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-300 dark:hover:bg-white/5">使用示例</button>}
          <button
            type="button"
            onClick={() => onUseSkill(skill)}
            aria-label={`使用技能 ${skill.title}`}
            className={`shrink-0 cursor-pointer rounded-full bg-slate-900 text-xs font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${compact ? 'min-h-6 px-2.5' : 'min-h-7 px-3 py-1'}`}
          >
            使用
          </button>
        </div>

        {skill.models && <p title={skill.models} className="mt-1 truncate font-mono text-[11px] leading-5 text-slate-500 dark:text-neutral-400">{skill.models}</p>}
        <p className={`line-clamp-2 leading-5 text-slate-500 dark:text-neutral-400 ${compact ? 'mt-1 text-sm font-normal' : 'mt-1.5 min-h-10 text-xs'}`}>
          {skill.description || '查看技能详情，了解创作方法与使用要求。'}
        </p>
        {!compact && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-4 text-slate-400 dark:text-neutral-500"><span>{skill.author || (skill.runtime === 'workshop' ? '电商图文' : '个人技能')}</span><span aria-hidden="true">·</span><span>{skill.source?.kind === 'local' ? '内置技能' : skill.category}</span></p>
        )}
      </div>
    </article>
  );
}
