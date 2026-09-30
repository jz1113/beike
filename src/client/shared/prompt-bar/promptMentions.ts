import type { SubjectItem } from './promptBarConstants';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { mentionTokenToName, parseSubjectMention } from '@shared/domain/prompts/prompt-engine/mentions';
import { resolveRefMediaIdentity } from '@client/shared/media/refMediaRegistry';

/** 🌟 核心主体与提及解析器 (支持 @主体、@主体1、图片原名、去除后缀、数字标号、{{Mixed 1}} 等全方位识别) */
export function resolveSubjectByMention(
  mention: string,
  allSubjects: SubjectItem[],
  quickRefImages: string[] = []
): SubjectItem | null {
  if (!mention) return null;
  const selected = parseSubjectMention(mention);
  if (selected) {
    const url = resolveRefMediaIdentity(selected.id);
    return allSubjects.find(subject => subject.url === url) ||
      (url && quickRefImages.includes(url) ? { id: selected.id, name: selected.name, url } : null);
  }
  const clean = mentionTokenToName(mention);
  if (!clean) return null;

  const cleanLower = clean.toLowerCase();
  const cleanNoExt = clean.replace(/\.[^/.]+$/, '').toLowerCase();
  const cleanNormalized = clean.replace(/[\s_\-.]+/g, '').toLowerCase();

  if (/^(图片|视频)\d+$/.test(clean) && quickRefImages.length > 0) {
    const media = mediaReferenceSlots(quickRefImages).find(item => item.name === clean);
    if (media) return allSubjects.find(subject => subject.url === media.url) || { id: `ref-${clean}`, ...media };
    return null;
  }

  // 1. 特殊全局关键词：@主体 / @模特 / @参考图 / @主图 / @商品图 -> 默认对应第 1 个主体
  if (['主体', '模特', '参考图', '商品图', '主图', '人物', '商品', '图片', '图'].includes(cleanLower)) {
    if (allSubjects.length > 0) return allSubjects[0];
    if (quickRefImages.length > 0) {
      return { id: 'ref-0', name: '主体', url: quickRefImages[0] };
    }
  }

  // 2. 序号别名：@主体1, @主体2, @模特1, @图片1, @图1, @insp_1, @insp1, {{Mixed 1}}
  const seqMatch =
    clean.match(/^(?:主体|模特|参考图|商品图|主图|图片|图|insp_|insp|image|img|mixed\s*)(\d+)$/i) ||
    clean.match(/^(\d+)$/);
  if (seqMatch) {
    const idx = parseInt(seqMatch[1], 10) - 1;
    if (idx >= 0) {
      if (quickRefImages[idx]) {
        return allSubjects.find(subject => subject.url === quickRefImages[idx]) || {
          id: `ref-${idx}`,
          name: `insp_${idx + 1}`,
          url: quickRefImages[idx],
        };
      }
      if (quickRefImages.length > 0) return null;
      if (allSubjects[idx]) return allSubjects[idx];
    }
  }

  // 3. 精准匹配名称或 ID (支持原名、带文件后缀或去除后缀)
  for (const s of allSubjects) {
    const sNameLower = s.name.toLowerCase();
    const sNameNoExt = s.name.replace(/\.[^/.]+$/, '').toLowerCase();
    const sNameNormalized = s.name.replace(/[\s_\-.]+/g, '').toLowerCase();

    if (
      s.id === clean ||
      sNameLower === cleanLower ||
      sNameNoExt === cleanNoExt ||
      sNameNoExt === cleanLower ||
      sNameLower === cleanNoExt ||
      sNameNormalized === cleanNormalized
    ) {
      return s;
    }
  }

  // 4. 模糊包含匹配 (例如文件名叫 "白色法式衬衫-模特图.png"，用户输入 "@白衬衫" 或 "@白色法式衬衫")
  if (clean.length >= 2) {
    for (const s of allSubjects) {
      const sNameNoExt = s.name.replace(/\.[^/.]+$/, '').toLowerCase();
      if (sNameNoExt.includes(cleanNoExt) || cleanNoExt.includes(sNameNoExt)) {
        return s;
      }
    }
  }

  return null;
}
