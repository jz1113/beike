import type { ReactNode } from 'react';
import type { SalesActualReference } from '@shared/domain/sales';
import { salesFocusClass } from './salesChrome';
import { SalesImagePreviewButton } from './SalesImagePreview';

export function SalesPromptReferences({ prompt, references }: { prompt: string; references: SalesActualReference[] }) {
  const parts: ReactNode[] = [];
  const pattern = /@?(?:图片|参考图)[ \t]*([1-9]\d*)(?![\d.．])/g;
  const previewImages = references.map((reference, index) => ({ ...reference, label: `图片${index + 1}` }));
  let offset = 0;
  for (const match of prompt.matchAll(pattern)) {
    const index = match.index;
    const reference = references[Number(match[1]) - 1];
    if (!reference) continue;
    parts.push(prompt.slice(offset, index));
    parts.push(
      <SalesImagePreviewButton key={index} image={previewImages[Number(match[1]) - 1]} images={previewImages} disabled={!reference.url} aria-label={`查看图片${match[1]}`} title={`查看图片${match[1]}`} className={`sales-prompt-mention ${salesFocusClass}`}>
        <img src={reference.url} alt="" loading="lazy" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain" />
        <span className="whitespace-nowrap">@图片{Number(match[1])}</span>
      </SalesImagePreviewButton>,
    );
    offset = index + match[0].length;
  }
  parts.push(prompt.slice(offset));
  return <>{parts}</>;
}
