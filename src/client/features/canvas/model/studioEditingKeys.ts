export interface StudioEditingCommands {
  selectAll: () => void;
  group: (ungroup: boolean) => void;
  redo: () => void;
}

/** Canvas commands must leave text editing, composition, and modal controls to their owners. */
export function handleStudioEditingKey(event: KeyboardEvent, commands?: StudioEditingCommands): boolean {
  if (!commands || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return false;
  const target = event.target as HTMLElement | null;
  if (target && (['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable
    || target.closest?.('[contenteditable="true"], [role="dialog"], dialog[open], [role="textbox"], [data-chat-copy-zone]'))) return false;
  const key = event.key.toLowerCase();
  let run: (()=>void) | undefined;
  if (key === 'a' && !event.shiftKey) run = commands.selectAll;
  if (key === 'g') run = ()=>commands.group(event.shiftKey);
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) run = commands.redo;
  if (!run) return false;
  event.preventDefault(); event.stopImmediatePropagation(); run(); return true;
}
