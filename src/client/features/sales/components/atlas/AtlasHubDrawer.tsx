import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, RefreshCw, Terminal } from 'lucide-react';
import { StudioSheet } from '@client/shared/ui/studio/StudioSheet';
import type { AtlasFaceItem, SalesAtlasCatalogResponse } from '@shared/contracts/salesAtlas';
import { fetchSalesAtlasCatalog, importSalesAtlasItems } from '../../api/salesAtlas';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from '../salesChrome';
import { AtlasHubToolbar } from './AtlasHubToolbar';
import { AtlasLightboxDialog, type AtlasLightboxTarget } from './AtlasLightboxDialog';
import { AtlasVirtualGrid, type AtlasGridDensity } from './AtlasVirtualGrid';

const HAIR_NAMES: Record<string, string> = {
  short: '短发',
  medium: '中发',
  semilong: '中长发',
  long: '长发',
};

const SERIES_NAMES: Record<string, string> = {
  full_std: '标准全身',
  upper: '上半身',
  full_sexy: '时尚全身',
  duo: '双人互动',
};

export interface AtlasHubDrawerProps {
  open: boolean;
  defaultTab?: 'face' | 'pose';
  defaultFaceAudience?: 'adult_female' | 'adult_male';
  pickerMode?: 'import' | 'pick-persona-main';
  onClose: () => void;
  onImported?: (summary: { kind: 'face' | 'pose'; count: number; message: string }) => void;
  onPickPersonaFace?: (face: AtlasFaceItem, suggestedName: string, suggestedGroup: 'female' | 'male') => Promise<void> | void;
}

export function AtlasHubDrawer({
  open,
  defaultTab = 'face',
  defaultFaceAudience = 'adult_female',
  pickerMode = 'import',
  onClose,
  onImported,
  onPickPersonaFace,
}: AtlasHubDrawerProps) {
  const [tab, setTab] = useState<'face' | 'pose'>(defaultTab);
  const [catalog, setCatalog] = useState<SalesAtlasCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<AtlasGridDensity>('sm');

  const [faceSection, setFaceSection] = useState('all');
  const [faceHair, setFaceHair] = useState('all');
  const [faceAudience, setFaceAudience] = useState<'adult_female' | 'adult_male'>(defaultFaceAudience);

  const [poseSeries, setPoseSeries] = useState('all');
  const [poseCategory, setPoseCategory] = useState('all');
  const [preferredAngle, setPreferredAngle] = useState('front');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [lightbox, setLightbox] = useState<AtlasLightboxTarget | null>(null);

  useEffect(() => {
    if (open) {
      setTab(pickerMode === 'pick-persona-main' ? 'face' : defaultTab);
      setFaceAudience(defaultFaceAudience);
      setSelectedIds([]);
      setNotice('');
      setError('');
    }
  }, [defaultFaceAudience, defaultTab, open, pickerMode]);

  const loadCatalog = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSalesAtlasCatalog('all', signal);
      if (!signal?.aborted) setCatalog(data);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '读取图鉴失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    void loadCatalog(controller.signal);
    return () => controller.abort();
  }, [catalog, open]);

  const filteredFaces = useMemo(() => {
    const list = catalog?.faces?.items || [];
    const q = query.trim().toLowerCase();
    return list.filter((item) => {
      if (faceSection !== 'all' && item.section !== faceSection) return false;
      if (faceHair !== 'all' && item.hair !== faceHair) return false;
      if (!q) return true;
      const hairZh = HAIR_NAMES[item.hair] || '';
      const secZh = item.section === 'styling' ? '造型人像' : '纯底正脸';
      return `${item.id} ${item.style} ${item.hair} ${hairZh} ${secZh}`.toLowerCase().includes(q);
    });
  }, [catalog?.faces?.items, faceHair, faceSection, query]);

  const availablePoseCategories = useMemo(() => {
    const allCats = catalog?.poses?.categories || [];
    if (poseSeries === 'all') return allCats;
    const allowed = new Set(catalog?.poses?.categoriesBySeries?.[poseSeries] || []);
    return allowed.size > 0 ? allCats.filter((c) => allowed.has(c.key)) : allCats;
  }, [catalog?.poses?.categories, catalog?.poses?.categoriesBySeries, poseSeries]);

  const filteredPoses = useMemo(() => {
    const list = catalog?.poses?.items || [];
    const q = query.trim().toLowerCase();
    return list.filter((item) => {
      if (poseSeries !== 'all' && item.series !== poseSeries) return false;
      if (poseCategory !== 'all' && item.category !== poseCategory) return false;
      if (!q) return true;
      const seriesZh = SERIES_NAMES[item.series] || '';
      return `${item.id} ${item.no} ${item.category} ${seriesZh} ${item.names.zh} ${item.names.en} ${item.names.ja}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalog?.poses?.items, poseCategory, poseSeries, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const importedSet = useMemo(() => new Set(importedIds), [importedIds]);
  const importing = Boolean(busyId) || batchBusy;

  const switchTab = (next: 'face' | 'pose') => {
    setTab(next);
    setSelectedIds([]);
    setQuery('');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleImportOne = async (id: string, angle?: string) => {
    if (busyId || batchBusy) return;
    setError('');
    setNotice('');
    if (tab === 'face' && pickerMode === 'pick-persona-main' && onPickPersonaFace) {
      const face = (catalog?.faces?.items || []).find((item) => item.id === id);
      if (!face) return;
      setBusyId(id);
      try {
        const hairZh = HAIR_NAMES[face.hair] || '标准';
        const secZh = face.section === 'styling' ? '造型人像' : '正脸人像';
        const suggestedName = `${hairZh}${secZh} #${face.id.slice(0, 6)}`;
        await onPickPersonaFace(face, suggestedName, faceAudience === 'adult_male' ? 'male' : 'female');
        setLightbox(null);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : '载入人像主图失败');
      } finally {
        setBusyId('');
      }
      return;
    }

    setBusyId(id);
    try {
      const res = await importSalesAtlasItems({
        kind: tab,
        ids: [id],
        preferredAngle: tab === 'pose' ? angle || preferredAngle : undefined,
        audience: tab === 'face' ? faceAudience : undefined,
      });
      setImportedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      const msg = res.imported > 0
        ? `已导入 1 项${tab === 'face' ? '人像到人物资产库' : '多视角姿态到动作资产库'}`
        : '该图鉴已在当前工作区资产库中，无需重复导入';
      setNotice(msg);
      onImported?.({ kind: tab, count: res.imported, message: msg });
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusyId('');
    }
  };

  const handleBatchImport = async () => {
    if (!selectedIds.length || importing) return;
    setBatchBusy(true);
    setError('');
    setNotice('');
    let totalImported = 0;
    let totalSkipped = 0;
    try {
      for (let offset = 0; offset < selectedIds.length; offset += 60) {
        const chunk = selectedIds.slice(offset, offset + 60);
        const res = await importSalesAtlasItems({
          kind: tab,
          ids: chunk,
          preferredAngle: tab === 'pose' ? preferredAngle : undefined,
          audience: tab === 'face' ? faceAudience : undefined,
        });
        totalImported += res.imported;
        totalSkipped += res.skipped;
        setImportedIds((prev) => [...new Set([...prev, ...chunk])]);
        setSelectedIds((prev) => prev.filter((id) => !chunk.includes(id)));
      }
      const msg = `批量完成：新增导入 ${totalImported} 项${totalSkipped > 0 ? `（跳过已存在 ${totalSkipped} 项）` : ''}`;
      setNotice(msg);
      onImported?.({ kind: tab, count: totalImported, message: msg });
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量导入失败');
      if (totalImported + totalSkipped > 0) {
        const message = `已完成 ${totalImported + totalSkipped} 项，其余选中项可重试。`;
        setNotice(message);
        onImported?.({ kind: tab, count: totalImported, message });
      }
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <>
      <StudioSheet
        open={open}
        onClose={onClose}
        title={pickerMode === 'pick-persona-main' ? '挑选人物主图' : '开源图鉴库'}
        subtitle={
          pickerMode === 'pick-persona-main'
            ? '选择人像作为参考主图，继续编辑人物与多视角。'
            : '选择人像或姿态，导入资产库后可在创作中复用。'
        }
        widthClassName="w-full max-w-[1180px] sales-atlas-sheet"
      >
        <div className="sales-atlas-body">
          {error ? (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-200">
              {notice}
            </p>
          ) : null}

          {loading && !catalog ? (
            <div className="flex flex-1 items-center justify-center py-20 text-sm text-slate-500 dark:text-zinc-400">
              <RefreshCw className="mr-2 size-4 animate-spin text-indigo-500" />
              正在加载开源图鉴索引…
            </div>
          ) : error && !catalog ? (
            <div className="sales-atlas-grid-empty" role="status">
              <p>暂时无法读取开源图鉴</p>
              <button type="button" onClick={() => void loadCatalog()} className={salesGhostButtonClass}>重新读取图鉴</button>
            </div>
          ) : catalog && !catalog.synced ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-10 text-center">
              <Terminal className="size-10 text-indigo-500" />
              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">尚未同步本地开源图鉴目录</h4>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                  在项目根目录运行一次同步命令，即可离线加载 1,499 张人像锚点与 288 组（1,439 张）五视角动作参考图。
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-mono text-xs text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                <span>{catalog.setupCommand || 'pnpm setup:atlas'}</span>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(catalog.setupCommand || 'pnpm setup:atlas')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300 ${salesFocusClass}`}
                >
                  <Copy className="size-3.5" />
                  复制
                </button>
              </div>
              <button type="button" onClick={() => void loadCatalog()} className={`${salesPrimaryButtonClass} h-9 px-4 text-xs ${salesFocusClass}`}>
                <RefreshCw className="size-3.5" />
                重新检测本地图鉴
              </button>
            </div>
          ) : (
            <>
              <AtlasHubToolbar
                tab={tab}
                pickerMode={pickerMode}
                disabled={importing}
                totalFacesCount={catalog?.faces?.items.length || 0}
                totalPosesCount={catalog?.poses?.items.length || 0}
                filteredFacesCount={filteredFaces.length}
                filteredPosesCount={filteredPoses.length}
                query={query}
                onQueryChange={setQuery}
                density={density}
                onDensityChange={setDensity}
                faceSection={faceSection}
                onFaceSectionChange={setFaceSection}
                faceHair={faceHair}
                onFaceHairChange={setFaceHair}
                faceAudience={faceAudience}
                onFaceAudienceChange={setFaceAudience}
                poseSeries={poseSeries}
                onPoseSeriesChange={(next) => {
                  setPoseSeries(next);
                  setPoseCategory('all');
                }}
                poseCategory={poseCategory}
                onPoseCategoryChange={setPoseCategory}
                availablePoseCategories={availablePoseCategories}
                preferredAngle={preferredAngle}
                onPreferredAngleChange={setPreferredAngle}
                onSwitchTab={switchTab}
              />

              <AtlasVirtualGrid
                tab={tab}
                faces={filteredFaces}
                poses={filteredPoses}
                density={density}
                preferredAngle={preferredAngle}
                pickerMode={pickerMode}
                disabled={importing}
                selectedIds={selectedSet}
                importedIds={importedSet}
                busyId={busyId}
                onToggleSelect={toggleSelect}
                onImportOne={(id, angle) => void handleImportOne(id, angle)}
                onOpenLightbox={(index, activeAngle) =>
                  setLightbox(
                    tab === 'face'
                      ? { kind: 'face', items: filteredFaces, index }
                      : { kind: 'pose', items: filteredPoses, index, initialAngle: activeAngle || preferredAngle },
                  )
                }
              />

              {pickerMode === 'import' && selectedIds.length > 0 ? (
                <div className="sales-atlas-batch-bar">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="rounded-full bg-indigo-500 px-2.5 py-0.5 font-semibold text-white">
                      已选 {selectedIds.length} 项
                    </span>
                    <span className="text-slate-300">
                      {tab === 'face' ? '导入当前工作区「人物资产库」' : '导入当前工作区「动作素材」，保留五个机位'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => setSelectedIds([])}
                      className={`${salesGhostButtonClass} h-8 border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20 ${salesFocusClass}`}
                    >
                      取消选择
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => void handleBatchImport()}
                      className={`${salesPrimaryButtonClass} h-8 px-4 text-xs ${salesFocusClass}`}
                    >
                      <Download className="size-3.5" />
                      {batchBusy ? '正在批量导入…' : `批量导入 (${selectedIds.length})`}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </StudioSheet>

      {lightbox ? (
        <AtlasLightboxDialog
          target={lightbox}
          pickerMode={pickerMode}
          importing={Boolean(busyId) || batchBusy}
          onNavigate={(nextIndex) => setLightbox((prev) => (prev ? { ...prev, index: nextIndex } : null))}
          onImportCurrent={(id, angle) => void handleImportOne(id, angle)}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}
