import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Folder, FolderInput, Upload, RefreshCw, Search, X } from 'lucide-react';
import { useViewVisibility } from '@client/shared/hooks/useSafeTimeout';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useAppStore } from '@client/store';
import { getGlobalAssetLibrary, subscribeAssetInvalidation, type GlobalAssetStore } from '@client/shared/api/assetLibraryCache';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { collectCustomMedia, readMediaFolders, mediaFolderKinds } from '@client/features/assets/model/customAssetStore';
import { loadCustomAssets } from '@client/shared/media/customAssetStorage';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { fetchSalesStudioAssets, type SalesStudioAssetCatalog } from '@client/features/sales/api/salesMaterials';
import { classifyVoiceGroup } from '@client/features/sales/model/salesMaterialCatalog';
import { classifyPersonaGroup } from '@client/features/sales/model/salesActionViews';
import { listSalesScripts, type StoredSalesScript } from '@client/features/sales/api/salesScripts';
import { classifyActionScript, indexLibrary, mediaKind, type LibraryMedia, type LibraryEntry, type ScriptEntry } from './mediaIndex';
import {
  MediaFilterDropdown,
  MediaLibraryResults,
  ScriptDetail,
  MediaCollectionControls,
  type FilterDropdownOption,
} from './LibraryMediaCard';
import { SalesAssetJobsPanel } from '@client/features/sales/components/SalesAssetJobsPanel';
import { LibraryProductionTools } from './LibraryProductionTools';
import { indexMediaFolders, personaFolder } from './mediaFolders';
import './mediaLibrary.css';

const BUILTIN_ROOTS = new Set(['场景', '人物', '声音', '动作']);
const assetNameOrder = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function MediaFolderSidebar({ id, expanded, folder, folders, onSelect, onRoleResources }: {
  id: string; expanded: boolean; folder: string; folders: ReturnType<typeof indexMediaFolders>;
  onSelect: (path: string) => void; onRoleResources?: () => void;
}) {
  const root = folder.split('/')[0];
  const topFolders = folders.filter(
    node => !node.parent && (node.count > 0 || BUILTIN_ROOTS.has(node.path) || root === node.path),
  );
  return <aside id={id} aria-label="素材文件夹" data-expanded={expanded}>
    {onRoleResources && <button onClick={onRoleResources}>角色资源库</button>}
    {topFolders.map(({ path, count: itemCount }) => (
      <div key={path} className="bml-folder-row">
        <button title={path} aria-pressed={root === path} onClick={() => onSelect(path)}>
          <Folder size={13}/><span className="bml-folder-name">{path}</span><span className="bml-folder-count">{itemCount}</span>
        </button>
      </div>
    ))}
  </aside>;
}

const BUILTIN_SUBFOLDERS = new Set([
  '场景/室内',
  '场景/室外',
  '声音/人声',
  '声音/BGM',
  '人物/女',
  '人物/男',
]);

export default function MediaLibrary({ title, onInsert, onUseReference, onClose, onDragChange, onRoleResources, initialFolder = '场景', visit, onReturn, productionTools }: {
  title?: string;
  onUseReference?: (item: LibraryMedia) => void;
  initialFolder?: string; visit?: object | null; onReturn?: () => void; productionTools?: boolean;
  onInsert?: (item: LibraryMedia) => void; onClose?: () => void; onDragChange?: (dragging: boolean) => void; onRoleResources?: () => void;
}) {
  const defaultFolder = initialFolder || '场景';
  const active = useViewVisibility();
  const resumed = useRef(false);
  const tasks = useAppStore(s => s.generationTasks);
  const sessions = useAppStore(s => s.sessions);
  const projects = useCanvasStore(s => s.projects);
  const [local, setLocal] = useState(loadCustomAssets);
  const [savedFolders, setSavedFolders] = useState<string[]>([]);
  const previousSaved = useRef<string[]>([]);
  const [catalog, setCatalog] = useState<SalesStudioAssetCatalog | null>(null);
  const [shared, setShared] = useState<GlobalAssetStore | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(defaultFolder);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const folderPanelId = useId();
  const [scripts, setScripts] = useState<StoredSalesScript[]>([]);
  const [kind, setKind] = useState<LibraryEntry['kind'] | 'all'>('all');
  const [preview, setPreview] = useState<LibraryEntry | null>(null);
  const [previewError, setPreviewError] = useState('');
  const previewRef = useModalDialog(active && Boolean(preview && preview.kind !== 'script'), () => setPreview(null));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedImports, setFailedImports] = useState<File[]>([]);
  const importLock = useRef(false);
  const uploadedImports = useRef(new Map<File, string>());
  const files = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setFolder(defaultFolder);
    setKind('all');
    setQuery('');
    setPreview(null);
  }, [defaultFolder, visit]);
  useEffect(() => {
    const update = () => {
      setLocal(loadCustomAssets());
      try {
        const saved = readMediaFolders();
        setSavedFolders(saved);
        const previous = previousSaved.current;
        previousSaved.current = saved;
        setFolder(current => (!current || (previous.includes(current) && !saved.includes(current))) ? '场景' : current);
      } catch {
        setNotice('无法读取本机素材文件夹');
      }
    };
    update();
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key === 'beike.custom_assets' || e.key === 'beike.media_folders.v1') update();
    };
    window.addEventListener('beike:custom_assets_updated', update);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('beike:custom_assets_updated', update);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    if (!active) {
      resumed.current = true;
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setLoadError('');
    Promise.allSettled([fetchSalesStudioAssets(abort.signal), getGlobalAssetLibrary(version > 0 || resumed.current), listSalesScripts(abort.signal)]).then(([sales, assets, references]) => {
      if (abort.signal.aborted) return;
      if (sales.status === 'fulfilled') setCatalog(sales.value);
      if (assets.status === 'fulfilled') setShared({ ...assets.value });
      if (references.status === 'fulfilled') setScripts(references.value);
      const missing = [
        references.status === 'rejected' ? '动作脚本' : '',
        sales.status === 'rejected' ? '工作区资产' : '',
        assets.status === 'rejected' || !assets.value.isLoaded ? '资产库' : '',
      ].filter(Boolean);
      setLoadError(missing.length ? missing.join('、') + '未能读取，点刷新可重试。' : '');
      setLoading(false);
    });
    resumed.current = false;
    return () => abort.abort();
  }, [active, version]);
  useEffect(() => subscribeAssetInvalidation(() => setVersion(n => n + 1)), []);
  const items = useMemo(() => indexLibrary(local, [...tasks, ...sessions.flatMap(s => s.tasks)], projects, catalog, shared, scripts), [local, tasks, sessions, projects, catalog, shared, scripts]);
  const folders = useMemo(() => indexMediaFolders(items, savedFolders), [items, savedFolders]);
  const root = folder.split('/')[0];
  const [personaAge, setPersonaAge] = useState('');
  const [voiceGender, setVoiceGender] = useState('');
  const [voiceAge, setVoiceAge] = useState('');
  const [actionDepth, setActionDepth] = useState('');
  const [actionStyle, setActionStyle] = useState('');
  const voiceDemographics = useMemo(() => {
    const byId = new Map<string, { gender: string; age: string }>();
    const byUrl = new Map<string, { gender: string; age: string }>();
    for (const v of catalog?.voices ?? []) {
      const [, gender = '女', age = '青年'] = personaFolder(classifyVoiceGroup(v)).split('/');
      byId.set(v.id, { gender, age });
      if (v.sampleAudioUrl) byUrl.set(v.sampleAudioUrl, { gender, age });
    }
    return (item: LibraryEntry) => {
      for (const source of item.sources ?? []) {
        if (source.type === 'sound' && byId.has(source.id)) return byId.get(source.id)!;
      }
      if (byUrl.has(item.url)) return byUrl.get(item.url)!;
      const explicitGender = item.keywords.includes('男') ? '男' : item.keywords.includes('女') ? '女' : '';
      const explicitAge = ['青年', '中年', '老年', '儿童'].find(a => item.keywords.includes(a)) ?? '';
      if (explicitGender && explicitAge) return { gender: explicitGender, age: explicitAge };
      const [, gender = '女', age = '青年'] = personaFolder(
        classifyPersonaGroup({ name: item.name, description: item.keywords.join(' '), tags: item.keywords.join(',') }),
      ).split('/');
      return { gender: explicitGender || gender, age: explicitAge || age };
    };
  }, [catalog]);
  const productionFolder = productionTools && ['动作', '人物', '场景', '声音'].includes(root);
  const fixedKind = mediaFolderKinds[root];
  const selectedKind = fixedKind || kind;
  const term = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => items.filter(item => (selectedKind === 'all' || selectedKind === item.kind)
    && (!folder || item.folders.some(path => path === folder || path.startsWith(folder + '/')))
    && (root !== '人物' || !personaAge || item.folders.some(path => path.startsWith('人物/') && path.split('/')[2] === personaAge))
    && (folder !== '声音/人声' || !voiceGender || voiceDemographics(item).gender === voiceGender)
    && (folder !== '声音/人声' || !voiceAge || voiceDemographics(item).age === voiceAge)
    && (root !== '动作' || !actionDepth || (item.kind === 'script' && classifyActionScript(item.record).depth === actionDepth))
    && (root !== '动作' || !actionStyle || (item.kind === 'script' && classifyActionScript(item.record).style === actionStyle))
    && (!term || [item.name, ...item.keywords, ...item.folders].join(' ').toLocaleLowerCase().includes(term))
  ).sort((a, b) => assetNameOrder.compare(a.name, b.name)), [items, selectedKind, folder, root, personaAge, voiceGender, voiceAge, actionDepth, actionStyle, voiceDemographics, term]);
  const filterOptions = useMemo((): FilterDropdownOption[] => {
    if (root === '动作') return [];
    if (root === '人物') {
      const genderFolders = ['人物/女', '人物/男'];
      return genderFolders.map(path => {
        const node = folders.find(item => item.path === path);
        return { value: path, label: path.slice('人物/'.length), count: node?.count ?? 0 };
      });
    }
    const children = folders.filter(
      node => node.path.startsWith(root + '/') && (node.count > 0 || node.path === folder || BUILTIN_SUBFOLDERS.has(node.path)),
    );
    if (!children.length) return [];
    return children.map(node => {
      const subName = node.path.slice(root.length + 1).replaceAll('/', ' / ');
      return { value: node.path, label: subName, count: node.count };
    });
  }, [folders, root, folder]);
  const personaAgeOptions = useMemo((): FilterDropdownOption[] => {
    if (root !== '人物') return [];
    const genderPrefix = folder === '人物/女' || folder === '人物/男' ? folder + '/' : '人物/';
    const baseItems = items.filter(item => item.folders.some(path => path === folder || path.startsWith(genderPrefix)));
    const ageCounts = new Map<string, number>();
    for (const age of ['青年', '中年', '老年', '儿童']) ageCounts.set(age, 0);
    for (const item of baseItems) {
      const matchedAges = new Set<string>();
      for (const path of item.folders) {
        if (path.startsWith(genderPrefix)) {
          const parts = path.split('/');
          if (parts[2]) matchedAges.add(parts[2]);
        }
      }
      for (const age of matchedAges) ageCounts.set(age, (ageCounts.get(age) ?? 0) + 1);
    }
    return [...ageCounts.entries()].map(([age, count]) => ({ value: age, label: age, count }));
  }, [root, folder, items]);
  const voiceGenderOptions = useMemo((): FilterDropdownOption[] => {
    if (folder !== '声音/人声') return [];
    const voiceItems = items.filter(item => item.folders.includes('声音/人声'));
    const counts = { 女: 0, 男: 0 };
    for (const item of voiceItems) {
      const { gender } = voiceDemographics(item);
      if (gender === '女' || gender === '男') counts[gender] += 1;
    }
    return [
      { value: '女', label: '女', count: counts.女 },
      { value: '男', label: '男', count: counts.男 },
    ];
  }, [folder, items, voiceDemographics]);
  const voiceAgeOptions = useMemo((): FilterDropdownOption[] => {
    if (folder !== '声音/人声') return [];
    const voiceItems = items.filter(
      item => item.folders.includes('声音/人声') && (!voiceGender || voiceDemographics(item).gender === voiceGender),
    );
    const ageCounts = new Map<string, number>();
    for (const age of ['青年', '中年', '老年', '儿童']) ageCounts.set(age, 0);
    for (const item of voiceItems) {
      const { age } = voiceDemographics(item);
      if (ageCounts.has(age)) ageCounts.set(age, (ageCounts.get(age) ?? 0) + 1);
    }
    return [...ageCounts.entries()].map(([age, count]) => ({ value: age, label: age, count }));
  }, [folder, items, voiceGender, voiceDemographics]);
  const actionDepthOptions = useMemo((): FilterDropdownOption[] => {
    if (root !== '动作') return [];
    const actionItems = items.filter(
      (item): item is ScriptEntry =>
        item.kind === 'script' &&
        item.folders.some(p => p === '动作' || p.startsWith('动作/')) &&
        (!actionStyle || classifyActionScript(item.record).style === actionStyle),
    );
    const counts = { 深度视频: 0, 仅分镜: 0 };
    for (const item of actionItems) {
      const { depth } = classifyActionScript(item.record);
      counts[depth] += 1;
    }
    return [
      { value: '深度视频', label: '深度视频', count: counts.深度视频 },
      { value: '仅分镜', label: '仅分镜', count: counts.仅分镜 },
    ];
  }, [root, items, actionStyle]);
  const actionStyleOptions = useMemo((): FilterDropdownOption[] => {
    if (root !== '动作') return [];
    const actionItems = items.filter(
      (item): item is ScriptEntry =>
        item.kind === 'script' &&
        item.folders.some(p => p === '动作' || p.startsWith('动作/')) &&
        (!actionDepth || classifyActionScript(item.record).depth === actionDepth),
    );
    const counts = { 律动展示: 0, 口播讲解: 0, 细节特写: 0 };
    for (const item of actionItems) {
      const { style } = classifyActionScript(item.record);
      counts[style] += 1;
    }
    return [
      { value: '律动展示', label: '律动展示', count: counts.律动展示 },
      { value: '口播讲解', label: '口播讲解', count: counts.口播讲解 },
      { value: '细节特写', label: '细节特写', count: counts.细节特写 },
    ];
  }, [root, items, actionDepth]);
  useEffect(() => {
    if (!active || preview || !onClose) return;
    const keyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [active, preview, onClose]);
  async function importFiles(list: File[]) {
    if (importLock.current || !list.length) return;
    importLock.current = true;
    setBusy(true);
    let added = 0, skipped = 0, skippedVideos = 0;
    let lastTargetFolder = folder;
    const failed: File[] = [], errors: string[] = [];
    const paths = new Set(list.map(file => file.webkitRelativePath || file.name));
    failedImports.forEach(file => {
      if (!list.includes(file) && paths.has(file.webkitRelativePath || file.name)) uploadedImports.current.delete(file);
    });
    for (const file of list) {
      const type = mediaKind(file.type) || mediaKind(file.name);
      if (type === 'video') { skippedVideos++; continue; }
      if (!type) { skipped++; continue; }
      try {
        const url = uploadedImports.current.get(file) || await uploadStudioFile(file, 'canvas-library');
        uploadedImports.current.set(file, url);
        let targetFolder = '场景/室内';
        let tags: string[] | undefined;
        if (type === 'audio') {
          targetFolder = folder === '声音/BGM' ? '声音/BGM' : '声音/人声';
          tags = targetFolder === '声音/BGM' ? ['BGM'] : [voiceGender || '女', voiceAge || '青年'];
        } else if (root === '人物') {
          const g = folder.split('/')[1] === '男' ? '男' : '女';
          const a = personaAge || '青年';
          targetFolder = `人物/${g}/${a}`;
          tags = [g, a];
        } else {
          targetFolder = folder === '场景/室外' ? '场景/室外' : '场景/室内';
        }
        collectCustomMedia(file.name, url, type, targetFolder, false, tags);
        lastTargetFolder = targetFolder.startsWith('人物/') ? targetFolder.split('/').slice(0, 2).join('/') : targetFolder;
        uploadedImports.current.delete(file);
        added++;
      } catch (error) {
        failed.push(file);
        errors.push(file.name + '：' + (error instanceof Error ? error.message : '上传或保存失败'));
      }
    }
    setFailedImports(previous => [...previous.filter(file => !paths.has(file.webkitRelativePath || file.name)), ...failed]);
    setNotice([
      `已导入 ${added} 项到「${lastTargetFolder}」`,
      skippedVideos ? '素材库不支持直接导入视频，请前往「动作」分类使用导入视频分析' : '',
      skipped ? `已跳过 ${skipped} 个非媒体文件` : '',
      failed.length ? `${failed.length} 项上传或保存失败。${errors.slice(0, 3).join('；')}` : '',
    ].filter(Boolean).join('。'));
    if (added) { setFolder(lastTargetFolder); setKind('all'); setQuery(''); }
    importLock.current = false;
    setBusy(false);
  }
  const openPreview = useCallback((item: LibraryEntry) => {
    setPreviewError('');
    setPreview(item);
  }, []);
  const previewScript = preview?.kind === 'script' ? scripts.find(record => record.id === preview.record.id) : undefined;
  const close = preview ? () => setPreview(null) : onClose;
  const collectionControls = preview && (
    <MediaCollectionControls
      item={preview}
      folder={folder}
      saved={savedFolders}
      onDone={(message, path) => {
        setPreview(null);
        setFolder(path);
        setKind('all');
        setQuery('');
        setNotice(message);
      }}
    />
  );
  return (
    <section className="beike-media-library" aria-label={title ?? '统一素材库'}>
      <header>
        <h2>{title ?? '素材库'}</h2>
        <div className="bml-tools">
          {onReturn && <button onClick={onReturn}>返回视频制作</button>}
          {productionTools && (
            <LibraryProductionTools
              folder={folder}
              personaAge={personaAge}
              voiceGender={voiceGender}
              voiceAge={voiceAge}
              catalog={catalog}
              onNotice={setNotice}
              onImportedTarget={target => {
                setFolder(target.folder);
                if (target.personaAge !== undefined) setPersonaAge(target.personaAge);
                if (target.voiceGender !== undefined) setVoiceGender(target.voiceGender);
                if (target.voiceAge !== undefined) setVoiceAge(target.voiceAge);
                setKind('all');
                setQuery('');
              }}
            />
          )}
          {!productionFolder && root !== '动作' && (
            <>
              <button className="bml-import" disabled={busy} onClick={() => files.current?.click()}>
                <Upload size={14}/>
                {busy ? '导入中…' : '导入文件'}
              </button>
              <button disabled={busy} onClick={() => directory.current?.click()}>
                <FolderInput size={14}/>
                导入文件夹
              </button>
            </>
          )}
          <button
            disabled={loading}
            aria-label="刷新素材库"
            title={loading ? '正在读取素材' : '刷新素材库'}
            onClick={() => {
              setLocal(loadCustomAssets());
              setVersion(n => n + 1);
            }}
          >
            <RefreshCw size={16}/>
          </button>
          {onClose && (
            <button aria-label="关闭素材库" onClick={onClose}>
              <X size={17}/>
            </button>
          )}
        </div>
        <input
          hidden
          ref={files}
          type="file"
          accept="image/*,audio/*"
          multiple
          onChange={e => {
            void importFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <input
          hidden
          ref={el => {
            directory.current = el;
            el?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          multiple
          onChange={e => {
            void importFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </header>
      <button
        type="button"
        className="bml-folder-toggle"
        aria-expanded={foldersOpen}
        aria-controls={folderPanelId}
        onClick={() => setFoldersOpen(open => !open)}
      >
        <Folder size={15}/>
        <span>{folder || '场景'}</span>
        <ChevronDown size={14}/>
      </button>
      <MediaFolderSidebar
        id={folderPanelId}
        expanded={foldersOpen}
        folder={folder}
        folders={folders}
        onSelect={path => {
          setFolder(path);
          setPersonaAge('');
          setVoiceGender('');
          setVoiceAge('');
          setActionDepth('');
          setActionStyle('');
          setKind('all');
          setQuery('');
        }}
        onRoleResources={onRoleResources}
      />
      <main>
        {onDragChange && (
          <p className="bml-replace-hint">拖动素材到原上传节点即可替换，保留连线、不新增节点；也可点击“使用此素材”替换打开素材库的节点。</p>
        )}
        <div className="bml-filter-bar">
          <div className="bml-subfilter-group">
            {filterOptions.length > 0 && (
              <MediaFilterDropdown
                prefix={root === '场景' ? '空间' : root === '人物' ? '性别' : root === '声音' ? '类型' : '分类'}
                value={root === '人物' && folder.startsWith('人物/') ? folder.split('/').slice(0, 2).join('/') : folder}
                resetValue={root}
                options={filterOptions}
                onChange={next => {
                  setFolder(next);
                  setVoiceGender('');
                  setVoiceAge('');
                  setKind('all');
                  setQuery('');
                }}
              />
            )}
            {root === '人物' && personaAgeOptions.length > 0 && (
              <MediaFilterDropdown
                prefix="年龄段"
                value={personaAge}
                options={personaAgeOptions}
                onChange={setPersonaAge}
              />
            )}
            {folder === '声音/人声' && voiceGenderOptions.length > 0 && (
              <MediaFilterDropdown
                prefix="性别"
                value={voiceGender}
                options={voiceGenderOptions}
                onChange={setVoiceGender}
              />
            )}
            {folder === '声音/人声' && voiceAgeOptions.length > 0 && (
              <MediaFilterDropdown
                prefix="年龄段"
                value={voiceAge}
                options={voiceAgeOptions}
                onChange={setVoiceAge}
              />
            )}
            {root === '动作' && actionDepthOptions.length > 0 && (
              <MediaFilterDropdown
                prefix="形态"
                value={actionDepth}
                options={actionDepthOptions}
                onChange={setActionDepth}
              />
            )}
            {root === '动作' && actionStyleOptions.length > 0 && (
              <MediaFilterDropdown
                prefix="类型"
                value={actionStyle}
                options={actionStyleOptions}
                onChange={setActionStyle}
              />
            )}
            <span className="bml-total-pill">共 {visible.length} 项</span>
          </div>
          <div className="bml-tools bml-view-controls">
            <div className="bml-search">
              <Search size={15}/>
              <input
                ref={searchInput}
                autoFocus={!!onClose}
                aria-label="搜索素材"
                placeholder="搜索名称、标签或文件夹"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape' && query && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                    setQuery('');
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery('');
                    searchInput.current?.focus();
                  }}
                >
                  <X size={14}/>
                </button>
              )}
            </div>
          </div>
        </div>
        {productionTools && active && (root === '人物' || root === '场景') && (
          <SalesAssetJobsPanel kind={root === '人物' ? 'persona' : 'scene'}/>
        )}
        {(notice || loadError) && (
          <p className="bml-notice" role="status">{[notice, loadError].filter(Boolean).join('　')}</p>
        )}
        {!!failedImports.length && (
          <button disabled={busy} onClick={() => void importFiles(failedImports)}>
            {busy ? '正在重试…' : `重试失败的 ${failedImports.length} 项`}
          </button>
        )}
        {!visible.length ? (
          <div className="bml-empty">
            {loading
              ? '正在读取素材…'
              : savedFolders.includes(folder) && !query && kind === 'all'
                ? '这个文件夹还是空的。预览素材后，点「加入文件夹」即可收藏。'
                : items.length
                  ? '没有匹配的素材，可调整文件夹或筛选条件。'
                  : '还没有素材，导入文件或文件夹开始整理。'}
          </div>
        ) : (
          <MediaLibraryResults
            key={JSON.stringify([folder, selectedKind, term])}
            items={visible}
            folder={folder}
            folders={folders.map(node => node.path)}
            onNotice={setNotice}
            onMoved={path => {
              setFolder(path);
              setKind('all');
              setQuery('');
            }}
            onPreview={openPreview}
            onInsert={onInsert}
            onDragChange={onDragChange}
          />
        )}
      </main>
      {preview?.kind === 'script' && (
        <ScriptDetail
          folder={folder}
          key={preview.record.id}
          item={previewScript ? { ...preview, record: previewScript } : preview}
          onNotice={setNotice}
          onClose={() => setPreview(null)}
          collectionControls={collectionControls}
        />
      )}
      {preview && preview.kind !== 'script' && (
        <div ref={previewRef} tabIndex={-1} className="bml-viewer" role="dialog" aria-modal="true" aria-label="素材预览">
          <div>
            <strong>{preview.name}</strong>
            <button onClick={close} aria-label="关闭预览">
              <X size={18}/>
            </button>
          </div>
          {preview.kind === 'image' ? (
            <img src={proxyMediaUrl(preview.url)} alt={preview.name}/>
          ) : preview.kind === 'video' ? (
            <video controls src={proxyMediaUrl(preview.url, { asVideo: true })}/>
          ) : (
            <audio controls src={proxyMediaUrl(preview.url, { asAudio: true })}/>
          )}
          {onUseReference && preview.kind !== 'audio' && (
            <button
              className="bml-use-reference"
              onClick={() => {
                try {
                  onUseReference(preview);
                  setPreview(null);
                } catch (error) {
                  setPreviewError(error instanceof Error ? error.message : '添加参考素材失败');
                }
              }}
            >
              用作生成参考
            </button>
          )}
          {previewError && <p role="alert">{previewError}</p>}
          {collectionControls}
          {onInsert && <button onClick={() => onInsert(preview)}>使用此素材</button>}
        </div>
      )}
    </section>
  );
}
