import { formatSubjectMention, parseSubjectMention, PROMPT_MENTION_REGEX } from '@shared/domain/prompts/prompt-engine/mentions';
import { getRefMediaIdentity, resolveRefMediaIdentity } from '@client/shared/media/refMediaRegistry';
import { resolveSubjectByMention } from './promptMentions';
import type { SubjectItem } from './promptBarConstants';

export function serializeSubjectMention(subject: SubjectItem): string {
  return formatSubjectMention(getRefMediaIdentity(subject.url), subject.name);
}

/** Resolve selected pills before name-based compatibility normalization. */
export function normalizeSubjectReferences(prompt: string, slots: { url: string; name: string }[]): string {
  return prompt.replace(new RegExp(PROMPT_MENTION_REGEX.source, 'gi'), token => {
    const subject = parseSubjectMention(token);
    if (!subject) return token;
    const url = resolveRefMediaIdentity(subject.id);
    const slot = slots.find(item => item.url === url);
    return slot ? `@${slot.name}` : token;
  });
}

/** Bind remaining numbered aliases to their original target before indices change. */
export function removePromptReferences(prompt: string, oldUrls: string[], removedUrls: Set<string>, subjects: SubjectItem[]): string {
  return prompt.replace(new RegExp(PROMPT_MENTION_REGEX.source, 'gi'), token => {
    const subject = resolveSubjectByMention(token, subjects, oldUrls);
    if (!subject) return token;
    if (removedUrls.has(subject.url)) return '';
    return serializeSubjectMention(subject);
  }).replace(/[ \t]{2,}/g, ' ').trim();
}
