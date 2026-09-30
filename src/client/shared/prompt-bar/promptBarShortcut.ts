const handledEvents = new WeakSet<Event>();

/** One visible composer owns each global shortcut; focused composers take priority. */
export function claimPromptBarShortcut(event: Event, composer: HTMLElement | null): boolean {
  if (!composer || handledEvents.has(event)) return false;
  const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-prompt-composer]'))
    .filter(element => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
  const target = visible.find(element => element.contains(document.activeElement)) || visible[0];
  if (target !== composer) return false;
  handledEvents.add(event);
  return true;
}
