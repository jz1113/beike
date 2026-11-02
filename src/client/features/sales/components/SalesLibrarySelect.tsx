import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import '../salesLibrarySelect.css';

export interface SalesLibrarySelectOption {
  value: string;
  label: string;
  count?: number;
  description?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: readonly SalesLibrarySelectOption[];
  disabled?: boolean;
  searchable?: boolean;
  id?: string;
  active?: boolean;
  showSelectedCount?: boolean;
  countUnit?: string;
}

export function SalesLibrarySelect({ value, onChange, label, options, disabled = false, searchable = false, id, active = false, showSelectedCount = true, countUnit = '' }: Props) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const listId = `${fieldId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = options.filter((option) => `${option.label} ${option.description || ''}`.toLocaleLowerCase().includes(normalizedQuery));
  const highlightedIndex = Math.max(0, visible.findIndex((option) => option.value === highlighted));
  const activeId = open && visible.length ? `${listId}-${highlightedIndex}` : undefined;

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const bounds = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const menuWidth = Math.min(Math.max(bounds.width, 268), width - 20);
    const below = viewportTop + height - bounds.bottom - 16;
    const above = bounds.top - viewportTop - 16;
    const useBelow = below >= Math.min(menu.scrollHeight, 260) || below >= above;
    const available = Math.max(60, useBelow ? below : above);
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${Math.min(380, available)}px`;
    menu.style.left = `${Math.max(viewportLeft + 10, Math.min(bounds.left, viewportLeft + width - menuWidth - 10))}px`;
    menu.style.top = `${useBelow ? bounds.bottom + 6 : Math.max(viewportTop + 10, bounds.top - menu.offsetHeight - 6)}px`;
    menu.dataset.side = useBelow ? 'bottom' : 'top';
  }, []);

  const close = (restoreFocus = false) => {
    menuRef.current?.hidePopover();
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };
  const show = (fromEnd = false) => {
    if (disabled) return;
    setQuery('');
    setHighlighted(selected?.value ?? options[fromEnd ? options.length - 1 : 0]?.value ?? '');
    setOpen(true);
  };
  const choose = (option: SalesLibrarySelectOption) => {
    if (disabled) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || disabled || !menu) return;
    menu.showPopover();
    positionMenu();
    if (searchable) searchRef.current?.focus({ preventScroll: true });
  }, [open, disabled, searchable, positionMenu]);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [open, highlightedIndex, query, visible.length, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      positionMenu();
    };
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', onScroll, true);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', onScroll, true);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [open, positionMenu]);

  useEffect(() => {
    if (!disabled) return;
    menuRef.current?.hidePopover();
    setOpen(false);
  }, [disabled]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        show(event.key === 'ArrowUp');
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      // Resume the page's tab order from the trigger, including Shift+Tab.
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (searchable && (event.key === 'Home' || event.key === 'End') && !event.ctrlKey) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
        : Math.max(0, Math.min(visible.length - 1, highlightedIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      setHighlighted(visible[next]?.value ?? '');
    } else if (event.key === 'Enter' || (!searchable && event.key === ' ')) {
      event.preventDefault();
      if (visible[highlightedIndex]) choose(visible[highlightedIndex]);
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const candidates = [...visible.slice(highlightedIndex + 1), ...visible.slice(0, highlightedIndex + 1)];
      const next = candidates.find((option) => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (next) { event.preventDefault(); setHighlighted(next.value); }
    }
  };

  return <div className="sales-library-select" data-active={active || undefined}>
    <button ref={triggerRef} id={fieldId} type="button" className="sales-library-select-trigger"
      role={searchable ? undefined : 'combobox'} aria-label={label} aria-haspopup={searchable ? 'dialog' : 'listbox'}
      aria-expanded={open} aria-controls={searchable ? `${fieldId}-menu` : listId}
      aria-activedescendant={searchable ? undefined : activeId} disabled={disabled}
      onKeyDown={onKeyDown} onClick={() => open ? close() : show()} title={selected?.label || label}>
      <span className="sales-library-select-value">{selected?.label || label}</span>
      {showSelectedCount && selected?.count !== undefined && <span className="sales-library-select-count">{selected.count}{countUnit && ` ${countUnit}`}</span>}
      <ChevronDown size={14} aria-hidden />
    </button>
    <div ref={menuRef} id={`${fieldId}-menu`} popover="auto" className="sales-library-select-menu"
      role={searchable ? 'dialog' : undefined} aria-label={searchable ? label : undefined}
      onToggle={(event) => { if (event.newState === 'closed') setOpen(false); }}>
      {searchable && <div className="sales-library-select-search"><Search size={14} aria-hidden />
        <input ref={searchRef} value={query} role="combobox" aria-label={`搜索${label.replace(/^按(.+)筛选$/, '$1')}`} placeholder="搜索选项…"
          aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeId}
          onChange={(event) => { setQuery(event.target.value); setHighlighted(''); }} onKeyDown={onKeyDown} />
      </div>}
      <div ref={listRef} id={listId} role="listbox" aria-label={label} className="sales-library-select-options">
        {visible.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option"
          aria-selected={option.value === value} className="sales-library-select-option" data-index={index}
          data-highlighted={index === highlightedIndex || undefined}
          onPointerMove={(event) => { if (event.pointerType !== 'touch') setHighlighted(option.value); }}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <span className="sales-library-select-option-text"><span>{option.label}</span>
            {option.description && <small>{option.description}</small>}</span>
          {option.count !== undefined && <span className="sales-library-select-count">{option.count}{countUnit && ` ${countUnit}`}</span>}
          <Check size={14} className="sales-library-select-check" aria-hidden />
        </div>)}
      </div>
      {!visible.length && <p className="sales-library-select-empty" role="status">{query ? '没有匹配的选项' : '暂无可选项'}</p>}
    </div>
  </div>;
}
