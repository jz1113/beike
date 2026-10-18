import React, { useEffect, useState, useMemo, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { type PreferenceModelItem } from '../hooks/usePromptBarWorkflowModels';
import { usePromptBarPopoverLayout } from '../hooks/usePromptBarPopoverLayout';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { useAppStore } from '@client/store';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { upstreamModelId } from '@shared/domain/models/workflowModels';
import {
  groupModelsByGeneration,
  parseModelDetails,
  type GenerationRowItem,
} from '@shared/domain/models/modelGrouping';
import { looksBroken, PromptBarModelVariantStrip } from './PromptBarModelVariantStrip';

interface PromptBarModelPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  isUp?: boolean;
  models: PreferenceModelItem[];
  selectedModelId: string;
  modalityKind?: 'chat' | 'image' | 'video' | 'audio';
  onSelectModel: (modelId: string) => void;
}

export function menuLabelForModel(modelId: string, fallback = '') {
  const parsed = parseModelDetails(modelId);
  const variant = parsed.variantKey !== 'default' ? parsed.displayName : '';
  if (looksBroken(parsed.generationLabel) || looksBroken(variant)) return fallback || modelId;
  return variant ? `${parsed.generationLabel} ${variant}` : parsed.generationLabel;
}

function groupKey(model: PreferenceModelItem) {
  return model.upstreamId || model.id;
}

function sameModel(left: string, right: string) {
  const cleanLeft = upstreamModelId(left || '').toLowerCase().trim();
  const cleanRight = upstreamModelId(right || '').toLowerCase().trim();
  return cleanLeft === cleanRight
    || canonicalModelId(cleanLeft).toLowerCase() === canonicalModelId(cleanRight).toLowerCase()
    || left.toLowerCase() === right.toLowerCase();
}

export function PromptBarModelPickerModal({
  isOpen,
  onClose,
  triggerRef,
  isUp = true,
  models,
  selectedModelId,
  modalityKind = 'chat',
  onSelectModel,
}: PromptBarModelPickerModalProps) {
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(isOpen, isUp, triggerRef, 260, 420, true);
  const duplicateUpstreamIds = new Set<string>();
  const seenUpstreamIds = new Set<string>();
  for (const model of models) {
    const key = model.upstreamId || model.id;
    if (seenUpstreamIds.has(key)) duplicateUpstreamIds.add(key);
    seenUpstreamIds.add(key);
  }
  const listChannelsSeparately = duplicateUpstreamIds.size > 0;
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of models) {
      if (model.name && (model.upstreamId || model.name !== model.id)) {
        map.set(model.id, model.name);
        if (model.upstreamId) map.set(model.upstreamId, model.name);
      }
    }
    return map;
  }, [models]);

  const uniqueModelIds = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const model of models) {
      const key = groupKey(model);
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    }
    return list;
  }, [models]);

  const generationSections = useMemo(
    () => groupModelsByGeneration(uniqueModelIds, modalityKind),
    [uniqueModelIds, modalityKind],
  );

  const allRows = useMemo(() => {
    const list: GenerationRowItem[] = [];
    for (const section of generationSections) {
      for (const row of section.rows) {
        if (!row.isArchived) list.push(row);
      }
    }
    return list;
  }, [generationSections]);

  const chosenUpstream = models.find((model) => model.id === selectedModelId)?.upstreamId;
  const matchesSelection = (candidate: string) => (
    sameModel(candidate, selectedModelId) || Boolean(chosenUpstream && sameModel(candidate, chosenUpstream))
  );
  const selectionIdFor = (groupedModelId: string) => {
    const matches = models.filter((model) => sameModel(groupKey(model), groupedModelId));
    const current = matches.find((model) => model.id === selectedModelId || (model.upstreamId && sameModel(model.upstreamId, selectedModelId)));
    return current?.id || matches[0]?.id || groupedModelId;
  };
  const activeRowId = useMemo(() => {
    for (const row of allRows) {
      if (row.allModelIds.some((id) => sameModel(id, selectedModelId) || Boolean(chosenUpstream && sameModel(id, chosenUpstream)))) return row.rowId;
    }
    return null;
  }, [allRows, chosenUpstream, selectedModelId]);

  const [expandedRowId, setExpandedRowId] = useState<string | null>(activeRowId);

  useEffect(() => {
    if (isOpen) setExpandedRowId(activeRowId);
  }, [isOpen, activeRowId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef, panelRef]);

  if (!isOpen) return null;

  const openSettings = () => {
    onClose();
    useAppStore.getState().setCurrentView('settings');
  };

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className={`absolute ${
        opensUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
      } overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-[#18191c]/95 dark:text-slate-100 dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] z-50 animate-fade-in p-1.5 text-left select-none`}
    >
      <div className="space-y-1 py-0.5">
        {generationSections.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">暂无已启用的模型，请在设置中同步</p>
            <button
              type="button"
              onClick={openSettings}
              className="mt-3 text-xs font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200 cursor-pointer"
            >
              去设置同步模型
            </button>
          </div>
        ) : listChannelsSeparately ? (
          models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onSelectModel(model.id);
                onClose();
              }}
              className={`flex w-full items-center rounded-xl px-2.5 py-2 text-left text-sm ${
                model.id === selectedModelId ? 'bg-slate-100 font-semibold dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <span className="truncate">{model.name}</span>
            </button>
          ))
        ) : (
          generationSections.map((section, sectionIndex) => {
            const visibleRows = section.rows.filter((row) => !row.isArchived);
            if (!visibleRows.length) return null;
            return (
              <div key={section.vendorId} className={`space-y-0.5 ${sectionIndex > 0 ? 'pt-1.5' : ''}`}>
                {visibleRows.map((row) => (
                  <ModelRow
                    key={row.rowId}
                    row={row}
                    names={names}
                    matchesSelection={matchesSelection}
                    expanded={expandedRowId === row.rowId}
                    onToggle={() => setExpandedRowId((current) => current === row.rowId ? null : row.rowId)}
                    onSelect={(modelId) => {
                      onSelectModel(selectionIdFor(modelId));
                      onClose();
                    }}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ModelRow({
  row,
  names,
  matchesSelection,
  expanded,
  onToggle,
  onSelect,
}: {
  row: GenerationRowItem;
  names: Map<string, string>;
  matchesSelection: (modelId: string) => boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (modelId: string) => void;
}) {
  const single = row.variants.length === 1;
  const selected = row.allModelIds.some((id) => matchesSelection(id));
  const picked = row.variants.find((variant) => variant.allModelIds.some((id) => matchesSelection(id))) || row.variants[0];
  const synced = picked ? names.get(picked.primaryModelId) : undefined;
  const parsedSummary = picked && picked.variantKey !== 'default' ? picked.displayName : '';
  const broken = looksBroken(row.generationLabel) || looksBroken(parsedSummary);
  const title = broken && synced ? synced : row.generationLabel;
  const summary = broken ? '' : parsedSummary;

  return (
    <div className={`rounded-xl transition-all ${selected ? 'bg-slate-100 dark:bg-white/10' : expanded ? 'bg-slate-50 dark:bg-white/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(picked?.primaryModelId || row.allModelIds[0])}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(picked?.primaryModelId || row.allModelIds[0]);
          }
        }}
        className="flex min-h-9 cursor-pointer items-center justify-between gap-2 px-2.5 py-1"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ModelIcon modelId={row.vendorId === 'unknown' ? row.familyId : row.vendorId} className="h-4 w-4 shrink-0 object-contain" />
          <span title={title} className={`truncate text-sm ${selected ? 'font-semibold' : 'font-medium'}`}>{title}</span>
        </div>
        {single ? (
          summary ? <span className="shrink-0 text-[13px] text-slate-400">{summary}</span> : null
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            title={expanded ? '收起变体' : '展开变体'}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
            }}
            className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[13px] text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            {summary ? <span>{summary}</span> : null}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {expanded && !single && (
        <PromptBarModelVariantStrip
          variants={row.variants}
          names={names}
          selected={selected}
          matchesSelection={matchesSelection}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
