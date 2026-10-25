import { Copy, MoreHorizontal, PenLine, Trash2 } from 'lucide-react';
import type { SkillItem } from '../model/skillTypes';
import { SkillCover } from './SkillCover';

interface Props {
  skill: SkillItem;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onUseSkill: (skill: SkillItem) => void;
  onDetail: (skill: SkillItem) => void;
  onEdit: (skill: SkillItem) => void;
  onDelete: (skill: SkillItem) => void;
  onFeed: (skill: SkillItem) => void;
  onDuplicate?: (skill: SkillItem) => void;
}

export function SkillCard({
  skill,
  onUseSkill,
  onDetail,
  onEdit,
  onDelete,
  onFeed,
  onDuplicate,
}: Props) {
  const canDuplicate = onDuplicate && skill.runtime === 'assistant';
  const editable = !skill.isOfficial || skill.runtime === 'workshop';
  const bottomTag =
    skill.assetGuide || (skill.showcaseUrls && skill.showcaseUrls.length > 0 ? '参考场景' : '');

  return (
    <article className="group flex min-w-0 flex-col transition-transform duration-200">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.05] dark:bg-[#1B1D24] dark:shadow-[0_6px_22px_rgba(0,0,0,0.4)] dark:ring-white/[0.08]">
        <button
          type="button"
          onClick={() => onDetail(skill)}
          aria-label={`查看技能 ${skill.title}`}
          className="block h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-500"
        >
          <SkillCover skill={skill} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-80 transition-opacity group-hover:opacity-95"
          />
        </button>

        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/95 backdrop-blur-md">
          {skill.runtime === 'workshop' ? '电商图文换品' : 'AI生成'}
        </span>

        {bottomTag && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-md">
            {bottomTag}
          </span>
        )}

        {(editable || canDuplicate) && (
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
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
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onDetail(skill)}
              className="block w-full cursor-pointer truncate text-left text-[14px] font-bold tracking-tight leading-snug text-slate-900 transition-colors hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
            >
              {skill.title}
            </button>
          </h3>

          <button
            type="button"
            onClick={() => onUseSkill(skill)}
            className="shrink-0 cursor-pointer rounded-full bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white transition-all hover:bg-slate-700 active:scale-95 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            使用
          </button>
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400/90">
          {skill.description || '查看技能详情，了解创作方法与使用要求。'}
        </p>
      </div>
    </article>
  );
}
