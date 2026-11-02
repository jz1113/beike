import { useLayoutEffect, useRef, useState } from 'react';

/** Inherit absent values; callers choose whether an empty edit restores or clears text. */
export function SalesStoryboardTextEditor({
  value, fallback = '', label, placeholder, disabled, onChange, className = '', emptyUsesFallback = true,
}: {
  value?: string;
  fallback?: string;
  label: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
  emptyUsesFallback?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const effectiveText = emptyUsesFallback ? (value?.trim() ? value : fallback) : value ?? fallback;
  const text = disabled ? effectiveText : draft ?? effectiveText;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => {
      if (!input.clientWidth) return;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    let width = input.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer?.observe(input);
    return () => observer?.disconnect();
  }, [text]);

  return (
    <textarea
      ref={inputRef}
      rows={2}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onFocus={() => setDraft(effectiveText)}
      onBlur={() => setDraft(null)}
      onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }}
      className={`sales-sb-inline-textarea ${className}`.trim()}
    />
  );
}
