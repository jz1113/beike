import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';
import type { RichPromptInputRef } from '../richPromptInputTypes';

/** Restore focus when the collapsed editor is replaced by the expanded editor. */
export function usePromptBarFocus(
  expanded: boolean,
  inputRef: RefObject<RichPromptInputRef | null>,
  setDockFocused: (focused: boolean) => void,
  setComposerFocused: (focused: boolean) => void,
) {
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (expanded && restoreFocus.current) {
      restoreFocus.current = false;
      inputRef.current?.focus();
    }
  }, [expanded, inputRef]);

  return (event: FocusEvent<HTMLDivElement>) => {
    const editorFocused = event.target.getAttribute('contenteditable') === 'true';
    // Keep the collapsed upload button mounted until its click opens the file picker.
    if (!expanded && !editorFocused) return;
    if (!expanded && editorFocused) restoreFocus.current = true;
    setDockFocused(true);
    setComposerFocused(editorFocused);
  };
}
