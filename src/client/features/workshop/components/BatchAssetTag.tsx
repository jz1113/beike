import React from 'react';

type TagType = 'scene' | 'outfit' | 'action' | 'persona';

const BORDER_COLORS: Record<TagType, string> = {
  scene: 'border-l-emerald-500',
  outfit: 'border-l-sky-500',
  action: 'border-l-purple-500',
  persona: 'border-l-amber-500',
};

interface Props {
  type: TagType;
  text: string;
  title?: string;
}

export { formatAssetBadgeText } from '../model/assetPresentation';

export default function BatchAssetTag({ type, text, title }: Props) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-r-md bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200 border-l-2 ${BORDER_COLORS[type]} truncate max-w-full`}
      title={title || text}
    >
      {text}
    </span>
  );
}
