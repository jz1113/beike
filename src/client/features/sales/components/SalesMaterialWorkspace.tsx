import { SalesMaterialCatalogContext } from '../hooks/useSalesMaterialCatalog';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Compass, FileText, Film, Image, Plus, RefreshCw, Search, Upload, Users, Volume2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readSalesAssetDraft, salesAssetDraftKey } from '../model/salesAssetDraft';
import { SalesMaterialComplianceBadge } from './SalesMaterialComplianceBadge';
import { fetchSalesStudioAssets, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { PERSONA_GROUP_LABELS, PERSONA_GROUP_TABS, SCENE_SPACE_TABS, SOUND_KIND_TABS, salesMaterialCards, type SalesPersonaGroup } from '../model/salesMaterialCatalog';
import type { SalesAssetSection } from '../model/salesWorkspace';
import { SalesMaterialDetailDialog } from './SalesMaterialDetailDialog';
import { SalesMaterialCreateDialog } from './SalesMaterialCreateDialog';
import { SalesBgmImportDialog } from './SalesBgmImportDialog';
import { SalesImageImportDialog } from './SalesImageImportDialog';
import { SalesAssetJobsPanel } from './SalesAssetJobsPanel';
import { BGM_DURATION_FILTERS, matchesBgmDuration, type BgmDurationFilter } from '../model/salesBgmImport';
import { SalesSoundCard } from './SalesSoundCard';
import { SalesPersonaDialog } from './SalesPersonaDialog';
import { SalesSceneDialog } from './SalesSceneDialog';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { SalesMaterialSidebarContext } from './SalesMaterialSidebar';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesMaterial.css';
import '../salesBgmImport.css';

const TYPES = [
  { id: 'script', label: '动作素材', icon: Film },
  { id: 'persona', label: '人物资产', icon: Users },
  { id: 'scene', label: '场景资产', icon: Image },
  { id: 'sound', label: '声音资产', icon: Volume2 },
  { id: 'prompts', label: '提示词管理', icon: FileText },
] as const;

const EMPTY_CATALOG: SalesStudioAssetCatalog = { personas: [], scenes: [], actions: [], voices: [], bgms: [] };

function personaViewSummary(count = 0): { text: string; warn: boolean } {
  if (count >= 9) return { text: '9 个视角齐全', warn: false };
  if (count > 1) return { text: `${count} 个视角 · 缺 ${9 - count} 个`, warn: true };
  return { text: '只有主图', warn: true };
}

export function SalesMaterialWorkspace({
  children, section: kind, onSectionChange, promptContent, promptsUnsaved, navigationDisabled = false,
}: {
  children?: ReactNode;
  section: SalesAssetSection;
  onSectionChange: (section: SalesAssetSection) => void;
  promptContent: ReactNode;
  promptsUnsaved: boolean;
  navigationDisabled?: boolean;
}) {
  const [voiceGroup, setVoiceGroup] = useState<SalesPersonaGroup>('female');
  const [personaGroup, setPersonaGroup] = useState<SalesPersonaGroup>('female');
  const [sceneSpace, setSceneSpace] = useState<'outdoor' | 'indoor'>('outdoor');
  const [query, setQuery] = useState('');
  const [soundType, setSoundType] = useState<'voice' | 'bgm'>('voice');
  const [durationFilter, setDurationFilter] = useState<BgmDurationFilter>('all');
  const [importingBgm, setImportingBgm] = useState(false);
  const [importingImages, setImportingImages] = useState(false);
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [detailKey, setDetailKey] = useState('');
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [sidebarTarget, setSidebarTarget] = useState<HTMLDivElement | null>(null);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(new Set());
  const [sceneImageRatios, setSceneImageRatios] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const previousKind = useRef(kind);
  const [workspace] = useState(getWorkspaceSecret);

  const newDraft = kind === 'persona' || kind === 'scene'
    ? readSalesAssetDraft(salesAssetDraftKey(workspace, kind)) : null;
  const draftImages = new Set([...Object.values(newDraft?.views || {}), ...Object.values(newDraft?.request?.images || {})].filter(Boolean)).size;
  const hasDraft = Boolean(newDraft && (newDraft.fields.name?.trim() || draftImages || newDraft.request));
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const resetFilters = () => { setQuery(''); setDurationFilter('all'); };
  const saved = (message: string) => { resetFilters(); refresh(); setNotice(message); };

  useEffect(() => {
    if (previousKind.current === kind) return;
    previousKind.current = kind;
    setVoiceGroup('female'); setPersonaGroup('female'); setSceneSpace('outdoor'); setQuery(''); setSoundType('voice'); setDurationFilter('all'); setImportingBgm(false); setImportingImages(false); setDetailKey(''); setNotice(''); setCreating(false);
  }, [kind]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setFailedImages(new Set());
    void fetchSalesStudioAssets(controller.signal).then((data) => {
      if (!controller.signal.aborted) { setCatalog(data); setLoaded(true); }
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '读取素材失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const cards = useMemo(() => salesMaterialCards(catalog), [catalog]);
  const matching = cards.filter((card) => card.kind === kind
    && `${card.title} ${card.description} ${card.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visible = matching.filter((card) => (kind !== 'sound' || card.soundType === soundType)
    && (kind !== 'persona' || card.personaGroup === personaGroup)
    && (kind !== 'scene' || card.sceneSpace === sceneSpace)
    && (kind !== 'sound' || soundType !== 'voice' || card.voiceGroup === voiceGroup)
    && (kind !== 'sound' || soundType !== 'bgm' || matchesBgmDuration(card.durationSec, durationFilter))
  );
  const adjacentScene = kind === 'scene' ? visible.at(-1) : undefined;
  const sceneAddRatio = adjacentScene
    ? adjacentScene.image && !failedImages.has(adjacentScene.image) ? sceneImageRatios[adjacentScene.image] : 16 / 10
    : undefined;
  const groupTabs = kind === 'scene' ? SCENE_SPACE_TABS : PERSONA_GROUP_TABS;
  const groups = groupTabs.map(({ id, label }) => ({
    value: id, label,
    count: matching.filter((card) => kind === 'sound' ? card.soundType === 'voice' && card.voiceGroup === id
      : kind === 'scene' ? card.sceneSpace === id : card.personaGroup === id).length,
  }));
  const sidebarGroups = kind === 'sound' ? SOUND_KIND_TABS.map(({ id, label }) => ({
    value: id, label,
    count: matching.filter((card) => card.soundType === id).length,
  })) : groups;
  const detail = cards.find((c) => c.key === detailKey);
  const currentType = TYPES.find((t) => t.id === kind) ?? TYPES[0];
  const Icon = currentType.icon;
  const sectionLabel = kind === 'sound' ? soundType === 'voice' ? '人声' : 'BGM' : kind === 'scene' ? sceneSpace === 'outdoor' ? '户外场景' : '室内场景' : kind === 'persona' ? PERSONA_GROUP_LABELS[personaGroup] : currentType.label;
  const total = cards.filter((card) => card.kind === kind && (kind !== 'sound' || card.soundType === soundType)
    && (kind !== 'scene' || card.sceneSpace === sceneSpace) && (kind !== 'persona' || card.personaGroup === personaGroup)
    && (kind !== 'sound' || soundType !== 'voice' || card.voiceGroup === voiceGroup)).length;
  const filtered = Boolean(query.trim()) || (kind === 'sound' && soundType === 'bgm' && durationFilter !== 'all');
  const createLabel = kind === 'sound' ? '新增人声' : `新增${currentType.label.slice(0, 2)}`;

  return (
    <div className="sales-material-workspace min-h-0 flex-1">
      <section className="sales-library-shell" aria-label="资产库">
        <aside className="sales-cat-sidebar sales-assets-sidebar" aria-label="资产分类">
          {(['素材资产', '创作配置'] as const).map((heading, index) => (
            <div className="sales-cat-group" key={heading} role="group" aria-label={heading}>
              <span className="sales-cat-heading" aria-hidden>{heading}</span>
              {TYPES.filter(({ id }) => (id === 'prompts') === (index === 1)).map(({ id, label, icon: TypeIcon }) => (
                <Fragment key={id}>
                  <button
                    type="button"
                    disabled={navigationDisabled}
                    aria-current={kind === id ? 'true' : undefined}
                    className={`sales-cat-item ${salesFocusClass}`}
                    onClick={() => onSectionChange(id)}
                  >
                    <TypeIcon size={15} aria-hidden />
                    <span>{label}</span>
                    {id === 'prompts' ? (
                      promptsUnsaved && <small className="sales-asset-unsaved">未保存</small>
                    ) : id !== 'script' && (
                      <small>{loaded ? cards.filter((c) => c.kind === id).length : loading ? '…' : '—'}</small>
                    )}
                  </button>
                  {id === kind && (kind === 'script' || kind === 'prompts') && <div ref={setSidebarTarget} className="sales-material-category-slot" />}
                {id === kind && (kind === 'persona' || kind === 'scene' || kind === 'sound') && (
                  <nav className="sales-cat-subs" aria-label={kind === 'persona' ? '人物分类' : kind === 'scene' ? '场景分类' : '声音分类'}>
                    {sidebarGroups.map(({ value, label, count }) => (
                      <Fragment key={value}>
                        <button type="button" disabled={navigationDisabled}
                          aria-current={(kind === 'sound' ? soundType : kind === 'scene' ? sceneSpace : personaGroup) === value ? 'true' : undefined}
                          onClick={() => {
                            if (kind === 'sound') { setSoundType(value as typeof soundType); setDurationFilter('all'); }
                            else if (kind === 'scene') setSceneSpace(value as typeof sceneSpace);
                            else setPersonaGroup(value as SalesPersonaGroup);
                          }} title={label} className={`sales-cat-sub-item ${salesFocusClass}`}>
                          <span>{label}</span><small>{loaded ? count : loading ? '…' : '—'}</small>
                        </button>
                        {kind === 'sound' && value === 'voice' && soundType === 'voice' && (
                          <nav className="sales-cat-subs sales-voice-categories" aria-label="人声音色分类">
                            {groups.map(({ value: voiceCategory, label: voiceLabel, count: voiceCount }) => (
                              <button key={voiceCategory} type="button" disabled={navigationDisabled}
                                aria-current={voiceGroup === voiceCategory ? 'true' : undefined}
                                onClick={() => setVoiceGroup(voiceCategory as SalesPersonaGroup)} title={voiceLabel} className={`sales-cat-sub-item ${salesFocusClass}`}>
                                <span>{voiceLabel}</span><small>{loaded ? voiceCount : loading ? '…' : '—'}</small>
                              </button>
                            ))}
                          </nav>
                        )}
                      </Fragment>
                    ))}
                  </nav>
                )}
                </Fragment>
              ))}
            </div>
          ))}
        </aside>

        {kind === 'prompts' ? (
          <div className="sales-material-prompt-content">
            <SalesMaterialSidebarContext.Provider value={sidebarTarget}>{promptContent}</SalesMaterialSidebarContext.Provider>
          </div>
        ) : kind === 'script' ? (
          <div className="sales-material-script-content">
            <SalesMaterialCatalogContext.Provider value={{ catalog, loading, error, refresh }}>
              <SalesMaterialSidebarContext.Provider value={sidebarTarget}>{children}</SalesMaterialSidebarContext.Provider>
            </SalesMaterialCatalogContext.Provider>
          </div>
        ) : (
          <div className="sales-library-main">
            <div className="sales-library-top">
              <div className="sales-asset-toolbar">
                <div className="sales-asset-filter-controls">
                  {(kind === 'persona' || kind === 'scene') && <button type="button" disabled={!loaded || loading} onClick={() => setImportingImages(true)} className={salesGhostButtonClass}>
                    <Upload size={13} aria-hidden />批量导入{kind === 'persona' ? '人物' : '场景'}
                  </button>}
                  {kind === 'persona' && (
                    <button type="button" onClick={() => setAtlasOpen(true)} className={salesGhostButtonClass}>
                      <Compass size={13} aria-hidden />从开源图鉴导入
                    </button>
                  )}
                  {kind === 'sound' && soundType === 'bgm' && (
                    <SalesLibrarySelect
                      label="按音乐时长筛选"
                      value={durationFilter}
                      onChange={(value) => setDurationFilter(value as BgmDurationFilter)}
                      active={durationFilter !== 'all'}
                      showSelectedCount={false}
                      countUnit="首"
                      options={BGM_DURATION_FILTERS.map((option) => ({
                        ...option, count: matching.filter((card) => card.soundType === 'bgm' && matchesBgmDuration(card.durationSec, option.value)).length,
                      }))}
                    />
                  )}
                  {filtered && <button type="button" onClick={resetFilters} className={`sales-asset-reset ${salesGhostButtonClass}`}><X size={13} aria-hidden />清除筛选</button>}
                </div>

                <div className="sales-asset-search-tools">
                  <div className="sales-script-search">
                    <Search size={13} aria-hidden />
                    <input ref={searchRef} aria-label="搜索素材资产" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`搜索${sectionLabel}…`} />
                    {query && <button type="button" aria-label="清空素材搜索" onClick={() => { setQuery(''); searchRef.current?.focus(); }} className={salesFocusClass}><X size={14} aria-hidden /></button>}
                  </div>
                  <button type="button" disabled={loading} onClick={refresh} aria-label="刷新素材库" title="刷新素材库" className={salesGhostButtonClass}>
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {hasDraft && !creating && (
                <div className="sales-asset-draft-resume" role="status">
                  <FileText size={16} aria-hidden />
                  <div>
                    <strong>未入库草稿{newDraft?.fields.name?.trim() ? ` · ${newDraft.fields.name.trim()}` : ''}</strong>
                    <span>{draftImages ? `${draftImages} 张参考图已暂存` : newDraft?.request ? '生成任务已暂存' : '填写内容已暂存'}，继续编辑后保存到资产库。</span>
                  </div>
                  <button type="button" onClick={() => setCreating(true)} className={salesGhostButtonClass}>继续编辑</button>
                </div>
              )}
              {error && <p role="alert" className="sales-material-error">{loaded ? '刷新失败，当前显示上次加载的素材。' : ''}{error}<button type="button" disabled={loading} onClick={refresh} className={salesFocusClass}>重试</button></p>}
              {notice && <p role="status" className="sales-material-notice"><Check size={13} />{notice}</p>}
              {(kind === 'persona' || kind === 'scene') && <SalesAssetJobsPanel onSaved={refresh} />}
            </div>

            <div className="sales-library-scroll" aria-busy={loading}>
              {loading && !loaded ? (
                <div className="sales-library-empty-state" role="status"><RefreshCw size={20} className="animate-spin" /><h3>正在读取素材资产…</h3></div>
              ) : error && !loaded ? (
                <div className="sales-library-empty-state"><RefreshCw size={20} aria-hidden /><h3>暂时无法读取素材</h3><p>请重试，恢复后会显示已有素材。</p><button type="button" onClick={refresh} className={salesGhostButtonClass}>重新加载</button></div>
              ) : <>
                {!visible.length && filtered && (
                  <div className="sales-asset-empty-notice" role="status">
                    <div><strong>没有符合筛选条件的素材</strong><p>当前分类共有 {total} 个素材，可清除筛选后查看。</p></div>
                    <button type="button" onClick={resetFilters} className={salesGhostButtonClass}>清除全部筛选</button>
                  </div>
                )}
                <div className={`sales-material-grid ${kind === 'persona' ? 'is-persona-library' : kind === 'scene' ? 'is-scene-library' : kind === 'sound' ? 'is-sound-library' : ''}`}>
                  {visible.map((card) => {
                    if (card.kind === 'sound') return <SalesSoundCard key={card.key} card={card} onOpen={() => setDetailKey(card.key)} />;
                    if (card.kind === 'persona' || card.kind === 'scene') {
                      const viewInfo = card.kind === 'persona' ? personaViewSummary(card.personaViewCount) : null;
                      return (
                        <button
                          key={card.key}
                          type="button"
                          aria-label={`查看${card.title}详情`}
                          onClick={() => setDetailKey(card.key)}
                          className={`sales-persona-card ${card.kind === 'scene' ? 'is-scene' : ''} ${salesFocusClass}`}
                        >
                          <span className="sales-persona-card-image">
                            {card.image && !failedImages.has(card.image) ? (
                              <img src={proxyMediaUrl(card.image)} alt={card.title} loading="lazy"
                                onLoad={card.kind === 'scene' ? (event) => {
                                  const { naturalWidth, naturalHeight } = event.currentTarget;
                                  if (!naturalWidth || !naturalHeight) return;
                                  const ratio = naturalWidth / naturalHeight;
                                  setSceneImageRatios((previous) => previous[card.image] === ratio ? previous : { ...previous, [card.image]: ratio });
                                } : undefined}
                                onError={() => setFailedImages((previous) => new Set([...previous, card.image]))} />
                            ) : (
                              <span className="sales-material-placeholder">{card.kind === 'scene' ? <Image size={24} /> : <Users size={24} />}<span>{card.image ? '图片暂不可用' : '暂无主图'}</span></span>
                            )}
                            <span className="sales-persona-card-badges">
                              <span className="sales-persona-card-pill">{card.subBadge || card.badge}</span>
                            </span>
                          </span>
                          <span className="sales-persona-card-name" title={card.title}>{card.title}</span>
                          {viewInfo && (
                            <span className={`sales-persona-card-meta ${viewInfo.warn ? 'is-warn' : ''}`}>{viewInfo.text}</span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <article key={card.key} className={`sales-material-card ${card.kind === 'action' ? 'is-action' : ''}`}>
                        <button type="button" aria-label={`查看${card.title}详情`} onClick={() => setDetailKey(detailKey === card.key ? '' : card.key)} className={`sales-material-cover is-${kind} ${salesFocusClass}`}>
                          {card.video ? (
                            <video muted playsInline preload="metadata" src={proxyMediaUrl(card.video, { asVideo: true })} aria-label={`${card.title}视频预览`} />
                          ) : card.image && !failedImages.has(card.image) ? (
                            <img src={proxyMediaUrl(card.image)} alt={card.title} loading="lazy" onError={() => setFailedImages((previous) => new Set([...previous, card.image]))} />
                          ) : (
                            <div className="sales-material-placeholder"><Icon size={24} /><span>{card.image && failedImages.has(card.image) ? '参考图暂不可用' : card.badge}</span></div>
                          )}
                          <span className="sales-material-badge">{card.badge}</span>
                        </button>
                        <div className="sales-material-body">
                          <div className="sales-material-card-heading">
                            <h3 title={card.title}>{card.title}</h3>
                            {card.kind === 'action' && <SalesMaterialComplianceBadge url={card.video || card.image} mediaType={card.mediaType || (card.video ? 'video' : 'image')} />}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {(kind !== 'sound' || soundType === 'voice') && (
                    <button type="button" aria-label={hasDraft ? '继续草稿' : createLabel} onClick={() => setCreating(true)}
                      className={`sales-persona-card sales-persona-add-card ${kind === 'scene' ? 'is-scene' : ''} ${salesFocusClass}`}>
                      <span className="sales-persona-card-image sales-persona-add-frame" style={kind === 'scene' ? { aspectRatio: sceneAddRatio } : undefined}>
                        <Plus size={20} aria-hidden />
                        <strong>{hasDraft ? '继续草稿' : createLabel}</strong>
                        <small>{kind === 'persona' ? '上传或生图建立 9 视角' : kind === 'scene' ? '添加拍摄背景空间' : '可添加试听样本'}</small>
                      </span>
                    </button>
                  )}
                  {kind === 'sound' && soundType === 'bgm' && (
                    <button type="button" aria-label="导入 BGM" onClick={() => setImportingBgm(true)} className={`sales-persona-card sales-persona-add-card ${salesFocusClass}`}>
                      <span className="sales-persona-card-image sales-persona-add-frame">
                        <Upload size={20} aria-hidden /><strong>导入 BGM</strong><small>支持批量导入音频</small>
                      </span>
                    </button>
                  )}
                </div>
              </>}
            </div>
          </div>
        )}
      </section>

      {detail?.kind === 'persona' && <SalesPersonaDialog persona={catalog.personas.find((p) => p.id === detail.id)} voices={catalog.voices} onClose={() => setDetailKey('')} onSaved={saved} />}
      {detail?.kind === 'scene' && <SalesSceneDialog scene={catalog.scenes.find((item) => item.id === detail.id)} onClose={() => setDetailKey('')} onSaved={saved} />}
      {detail && detail.kind !== 'persona' && detail.kind !== 'scene' && <SalesMaterialDetailDialog card={detail} images={detail.sourceImages?.length ? detail.sourceImages : detail.image ? [detail.image] : []} onClose={() => setDetailKey('')} onChanged={(msg) => { if (msg) saved(msg); else refresh(); }} />}
      {creating && kind === 'persona' && <SalesPersonaDialog voices={catalog.voices} defaultGroup={personaGroup} onClose={() => setCreating(false)} onSaved={saved} />}
      {creating && kind === 'scene' && <SalesSceneDialog defaultSpace={sceneSpace} onClose={() => setCreating(false)} onSaved={saved} />}
      {creating && kind === 'sound' && <SalesMaterialCreateDialog type={kind} defaultSoundType={soundType === 'bgm' ? 'bgm' : 'voice'} defaultVoiceGroup={voiceGroup} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); saved('资产已保存，可跨商品复用'); }} />}
      {importingBgm && kind === 'sound' && <SalesBgmImportDialog onClose={() => setImportingBgm(false)} onImported={(count) => { setSoundType('bgm'); setDurationFilter('all'); setQuery(''); refresh(); setNotice(`已保存 ${count} 首背景音乐，可跨商品复用`); }} />}
      {importingImages && (kind === 'persona' || kind === 'scene') && <SalesImageImportDialog kind={kind} personaGroup={personaGroup} sceneSpace={sceneSpace}
        existingNames={kind === 'persona' ? catalog.personas.map((item) => item.name) : catalog.scenes.map((item) => item.title)}
        onClose={() => setImportingImages(false)} onImported={(count) => saved(`已导入 ${count} 个${kind === 'persona' ? '人物' : '场景'}资产`)} />}
      {atlasOpen && <AtlasHubDrawer open={atlasOpen} defaultTab={kind === 'script' ? 'pose' : 'face'} defaultFaceAudience={personaGroup === 'male' ? 'adult_male' : 'adult_female'} onClose={() => setAtlasOpen(false)} onImported={({ message }) => saved(message)} />}
    </div>
  );
}
