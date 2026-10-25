import { createPortal } from 'react-dom';
import { SkillGuideDialog } from '@client/shared/ui/SkillGuideDialog';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SkillLibraryEntry } from '@shared/domain/skills/library';
import { librarySkillItem } from '../model/libraryView';

export function SkillLibraryDetail({ entry, onClose }: { entry: SkillLibraryEntry; onClose: () => void }) {
  const item = librarySkillItem(entry);
  const files = entry.kind === 'assistant' ? entry.content.files || [] : [];
  let samples: string[] = [];
  if (entry.kind === 'workshop') {
    try {
      const raw: unknown = typeof entry.content.sampleImages === 'string' ? JSON.parse(entry.content.sampleImages) : entry.content.sampleImages;
      if (Array.isArray(raw)) samples = raw.filter((image): image is string => typeof image === 'string' && image.length > 0);
    } catch { /* Legacy rows can have no readable sample list. */ }
  }
  return createPortal(<SkillGuideDialog title={item.title} status={`适用场景：${entry.kind === 'workshop' ? '电商图文' : '助手'}`} layout="compact" items={[]}
    document={{ name: item.title, filename: entry.kind === 'assistant' ? 'SKILL.md' : '电商图文技能规则',
      source: item.prompt || '', body: item.prompt || '', overview: <div className="space-y-3 text-sm">
        <p>{item.description}</p><p>分类：{item.category}</p>
        {item.libraryVersion && <p>内容版本：{item.libraryVersion.slice(0, 12)}</p>}
        {entry.kind === 'assistant' && <p>工具范围：{entry.content.tools?.join('、') || '沿用助手运行时权限'}</p>}
        {entry.kind === 'workshop' && <p>执行顺序：匹配商品和母本 → 固定技能版本 → 视觉分析 → 生图与交付。</p>}
        {entry.kind === 'workshop' && entry.content.sourceUrl?.startsWith('skill:') && <p>源技能：{entry.content.sourceUrl.slice(6)}</p>}
        {samples.length > 0 && <div><p className="mb-2">提炼参考图</p><div className="grid grid-cols-3 gap-2">{samples.map((sample, index) => <img key={`${index}:${sample}`} src={proxyMediaUrl(sample)} alt={`提炼参考图 ${index + 1}`} className="aspect-square w-full rounded-lg object-cover" />)}</div></div>}
        {files.map(file => <details key={file.path}><summary>{file.path}</summary><pre className="whitespace-pre-wrap break-words text-xs">{file.content}</pre></details>)}
      </div> }} onClose={onClose} />, document.body);
}
