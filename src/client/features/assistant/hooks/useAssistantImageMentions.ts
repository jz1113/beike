import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RefObject, KeyboardEvent } from 'react';
import { useAppStore, type MediaAttachment } from '@client/store';
import { findImageMention, nextImageMention } from '../utils/assistantMentions';
import { resolveRefMediaName } from '@client/shared/media/refMediaRegistry';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

export function useAssistantImageMentions({ text, setText, attachments, textareaRef }: {
  text: string; setText: (text: string) => void; attachments: MediaAttachment[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const references = useAppStore(s => s.quickRefImages);
  const [range, setRange] = useState<ReturnType<typeof findImageMention>>(null);
  const [active, setActive] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const dismissed = useRef<{ text: string; cursor: number } | null>(null);
  const candidates = useMemo<Array<MediaAttachment & { source: string }>>(() => {
    const seen = new Set<string>();
    return [
      ...attachments.filter(a => a.type === 'image').map(a => ({ ...a, source: '本次附件' })),
      ...references.filter(url => !isVideoMediaUrl(url)).map((url, i) => ({ type: 'image' as const, url, name: resolveRefMediaName(url) || `参考图 ${i + 1}`, source: '当前参考图', mentionName: undefined })),
    ].filter(a => { if (!a.url || seen.has(a.url)) return false; seen.add(a.url); return true; });
  }, [attachments, references]);
  const options = candidates.filter(a => `${a.name || ''} ${a.mentionName || ''}`.toLowerCase().includes((range?.query || '').toLowerCase()));
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const update = (value: string, cursor: number) => {
    // React can emit select after Escape without moving the caret; do not reopen a dismissed menu.
    if (dismissed.current?.text === value && dismissed.current.cursor === cursor) return;
    dismissed.current = null;
    setRange(findImageMention(value, cursor)); setActive(0);
  };
  const close = () => {
    const input = textareaRef.current;
    if (input) dismissed.current = { text: input.value, cursor: input.selectionStart };
    setRange(null);
  };
  const select = (candidate: typeof candidates[number]) => {
    if (!range) return;
    const state = useAppStore.getState();
    const existing = state.assistantAttachments.find(a => a.type === 'image' && a.url === candidate.url);
    const mentionName = existing?.mentionName || nextImageMention(state.assistantAttachments, text);
    if (existing) state.setAssistantAttachments(state.assistantAttachments.map(a => a === existing ? { ...a, mentionName } : a));
    else state.addAssistantAttachment({ type: 'image', url: candidate.url, name: candidate.name, mentionName });
    const token = `@${mentionName} `;
    setText(text.slice(0, range.start) + token + text.slice(range.end));
    const cursor = range.start + token.length;
    close();
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(cursor, cursor); });
  };
  useEffect(() => {
    if (!range) return;
    const outside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && event.target !== textareaRef.current) setRange(null);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [range, textareaRef]);
  useEffect(() => { menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [activeIndex]);
  // A cleared or restored draft must never retain an old insertion range.
  useEffect(() => { if (range && text.slice(range.start, range.end) !== `@${range.query}`) setRange(null); }, [text, range]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!range || event.nativeEvent.isComposing || event.keyCode === 229) return false;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % (options.length || 1)); return true;
    }
    if (event.key === 'Enter' || (event.key === 'Tab' && options.length > 0)) {
      event.preventDefault(); if (options[activeIndex]) select(options[activeIndex]); return true;
    }
    return false;
  };
  return { open: Boolean(range), options, activeIndex, setActive, update, close, select, onKeyDown, menuRef, id };
}
