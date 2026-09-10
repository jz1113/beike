/** 尝试读取系统剪贴板文本（需安全上下文与权限；iframe 内可能失败） */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null;
  try {
    const text = await navigator.clipboard.readText();
    const trimmed = text?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

type PasteIntoFieldOptions = {
  onText: (text: string) => void;
  inputEl?: HTMLInputElement | HTMLTextAreaElement | null;
  onNeedManualPaste?: () => void;
};

/**
 * 粘贴到输入框：优先 Clipboard API；失败则聚焦输入框并监听下一次 paste 事件。
 * 返回 true 表示已成功写入内容。
 */
export async function pasteIntoField({
  onText,
  inputEl,
  onNeedManualPaste,
}: PasteIntoFieldOptions): Promise<boolean> {
  const fromClipboard = await readClipboardText();
  if (fromClipboard) {
    onText(fromClipboard);
    return true;
  }

  if (inputEl) {
    inputEl.focus();
    const onPaste: EventListener = (e) => {
      const ev = e as ClipboardEvent;
      const pasted = ev.clipboardData?.getData('text/plain')?.trim();
      if (pasted) {
        ev.preventDefault();
        onText(pasted);
      }
      inputEl.removeEventListener('paste', onPaste);
    };
    inputEl.addEventListener('paste', onPaste);
    window.setTimeout(() => inputEl.removeEventListener('paste', onPaste), 12_000);
  }

  onNeedManualPaste?.();
  return false;
}
