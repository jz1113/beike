import { useState } from 'react';
import { AudioLines, FileText, Film, Image as ImageIcon } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SkillItem } from '../model/skillTypes';

/** 优先展示作品/场景预览封面，缺省时提供高质感影视脚本视觉封面。 */
export function SkillCover({ skill }: { skill: SkillItem }) {
  const [failed, setFailed] = useState<string | null>(null);
  const cover = skill.coverUrl || skill.showcaseUrls?.[0];
  if (cover && cover !== failed) {
    return (
      <img
        src={proxyMediaUrl(cover)}
        alt={`${skill.title} 预览`}
        loading="lazy"
        onError={() => setFailed(cover)}
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    );
  }
  const genre = skill.genres?.[0] || (skill.runtime === 'workshop' ? '图片' : '视频');
  const Icon = { 视频: Film, 图片: ImageIcon, 音频: AudioLines, 文本: FileText }[genre];
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#232131] via-[#2f2b45] to-[#1a1926] text-white/90 transition-transform duration-500 ease-out group-hover:scale-[1.03]">
      <div aria-hidden="true" className="absolute -right-8 -top-12 h-44 w-44 rounded-full bg-indigo-500/15 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-rose-500/15 blur-2xl" />
      <div className="relative flex items-center gap-3.5 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 backdrop-blur-md">
        <Icon size={26} strokeWidth={1.5} className="text-white/90" />
        <span className="text-left">
          <span className="block text-sm font-semibold tracking-wide text-white">{genre}创作模板</span>
          <span className="mt-0.5 block text-[11px] text-white/65">{skill.category} · 脚本分镜</span>
        </span>
      </div>
    </div>
  );
}
