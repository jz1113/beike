import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, FolderInput,
  Image as ImageIcon, MountainSnow, Music4, Pause, Play, RefreshCw, UserRound, Video, X,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { collectCustomMedia, removeCollectedMedia, mediaFolderKinds, libraryMediaKey, moveLibraryMedia } from '@client/features/assets/model/customAssetStore';
import {
  buildScriptStoryboard,
  commonStoryboardNotes,
  rowStoryboardNotes,
  sectionCaption,
  storyboardColumns,
  storyboardSections,
  storyboardStyle,
} from '@client/features/sales/model/salesScriptStoryboard';
import '@client/features/sales/components/salesStoryboardTable.css';
import { MediaDeleteControl } from './MediaDeleteControl';
import { replaceLibraryMedia } from './mediaReplacement';
import { classifyActionScript, type LibraryMedia, type LibraryEntry, type MediaSource, type ScriptEntry } from './mediaIndex';
import { canvasLibraryDragType as mediaDragType } from '@client/shared/workspace/canvasWorkspace';

type Rows = ReturnType<typeof buildScriptStoryboard>;

export function SalesStoryboardTable({rows, selected, onSelect}: {rows:Rows; selected?:number; onSelect?:(index:number)=>void}) {
  const common = commonStoryboardNotes(rows);
  const sections = storyboardSections(rows);
  const estimated = rows.filter(row=>row.estimated).length;
  const example = rows.find(row => row.number.endsWith('.2'));
  const timing = estimated === 0 ? '' : estimated === rows.length ? '动作起止时间为估计值。' : '带 ≈ 的时间为估计值。';
  return <div className="script-reading">
    {(example || timing) && <p className="script-timing-note">{example && `${example.number} 表示第 ${example.segments[0].address.shot + 1} 个镜头的第 2 段动作。 `}{timing}</p>}
    {common.length > 0 && <dl className="script-common-notes">{common.map(note=><div key={note.label}><dt>全片{note.label}</dt><dd>{note.text}</dd></div>)}</dl>}
    <div className="script-table-scroll"><table aria-label={onSelect ? "动作分镜表" : "动作素材分镜表"}>
      <colgroup><col className="script-id-col"/><col className="script-time-col"/><col/><col className="script-camera-col"/></colgroup>
      <thead><tr>{storyboardColumns.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      {sections.map((section, sectionIndex)=><tbody key={section.rows[0].number}>
        {(section.label || sections.length > 1) && <tr className="script-section-row"><th scope="rowgroup" colSpan={4}>{sectionCaption(section,sectionIndex)}</th></tr>}
        {section.rows.map(row=>{
          const i = row.index - 1;
          const notes = rowStoryboardNotes(row,common);
          return <tr key={row.number} className={selected === i ? 'is-current' : undefined} onClick={onSelect && (()=>onSelect(i))}>
            <th scope="row">{onSelect ? <button aria-label={'定位分镜 '+row.number} aria-pressed={selected === i}
              onClick={event=>{event.stopPropagation();onSelect(i);}}>{row.number}</button> : row.number}</th>
            <td className="script-time"><strong>{row.duration} 秒</strong><small>{estimated < rows.length && row.estimated ? '≈ ' : ''}{row.range}</small></td>
            <td><span>{row.action}</span>{notes.length > 0 && <dl className="script-row-notes">{notes.map(note=>
              <div key={note.label}><dt>{note.label}</dt><dd>{note.text}</dd></div>)}</dl>}</td>
            <td>{row.camera}</td>
          </tr>;
        })}
      </tbody>)}
    </table></div>
  </div>;
}

export const mediaLabels = { all: '全部', image: '图片', video: '视频', audio: '音频', script: '脚本' };

let activeInlineAudio: HTMLAudioElement | null = null;

function formatAudioSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function InlineAudioCard({ item }: { item: LibraryMedia }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el && activeInlineAudio === el) {
        el.pause();
        activeInlineAudio = null;
      }
    };
  }, []);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      if (activeInlineAudio && activeInlineAudio !== el) {
        activeInlineAudio.pause();
      }
      activeInlineAudio = el;
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className={`bml-audio-player${playing ? ' is-playing' : ''}`}>
      <audio
        ref={audioRef}
        src={proxyMediaUrl(item.url, { asAudio: true })}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
      />
      <button
        type="button"
        className="bml-preview bml-audio-trigger"
        aria-label={(playing ? '暂停 ' : '播放 ') + item.name}
        onClick={togglePlay}
      >
        <span className="bml-fallback-cover" data-kind="audio">
          <span className="bml-audio-play-btn">
            {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="bml-play-offset" />}
          </span>
          <span className="bml-audio-waves" aria-hidden>
            <i /><i /><i /><i /><i />
          </span>
          <span className="bml-audio-time">
            {duration > 0 || currentTime > 0
              ? `${formatAudioSeconds(currentTime)} / ${formatAudioSeconds(duration)}`
              : '点击直接播放'}
          </span>
        </span>
      </button>
      <div className="bml-audio-bar" onClick={event => event.stopPropagation()}>
        <input
          type="range"
          className="bml-audio-range"
          aria-label={'播放进度 ' + item.name}
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.05}
          value={Math.min(currentTime, duration > 0 ? duration : 1)}
          style={{ '--audio-progress': `${progressPercent}%` } as React.CSSProperties}
          onChange={event => {
            const next = Number(event.target.value);
            setCurrentTime(next);
            if (audioRef.current) audioRef.current.currentTime = next;
          }}
        />
      </div>
    </div>
  );
}

function MediaReplaceControl({ item, folder, onNotice }: { item: LibraryMedia; folder: string; onNotice: (notice: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<MediaSource | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const choices = (item.sources ?? []).filter(source => source.type !== 'script' && (!folder || source.folder === folder || source.folder.startsWith(folder + '/')));
  if (!choices.length) return null;
  function choose(source: MediaSource) {
    selected.current = source;
    input.current?.click();
  }
  async function replace(file: File) {
    const source = selected.current;
    if (!source || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await replaceLibraryMedia(source, item.kind, item.url, file);
      onNotice('已替换「' + source.name + '」原文件，名称和分类保持不变');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '替换原文件失败');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <>
    <input ref={input} type="file" hidden accept={item.kind + '/*'} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void replace(file);
    }}/>
    {choices.length === 1 ? <button type="button" className="bml-replace-btn" disabled={busy} title="替换当前文件，保留名称和分类" aria-label={'替换原文件 ' + item.name}
      onClick={() => choose(choices[0])}><RefreshCw size={13}/><span>{busy ? '替换中…' : '替换'}</span></button>
      : <select className="bml-remove-source" aria-label="选择要替换原文件的资产" disabled={busy} value="" onChange={event => {
        const source = choices[Number(event.target.value)];
        if (source) choose(source);
      }}><option value="" disabled>{busy ? '替换中…' : '替换…'}</option>
        {choices.map((source, index) => <option key={source.type + source.id} value={index}>{source.folder} · {source.name}</option>)}
      </select>}
  </>;
}

function libraryThumbnail(url: string, width: number) {
  const src = proxyMediaUrl(url, { thumb: true, width });
  if (src.startsWith('/storage/') || /^https?:\/\/[^/]+\/storage\//i.test(src)) {
    const local = new URL(src, window.location.origin);
    local.searchParams.set('thumb', '1');
    local.searchParams.set('w', String(width));
    return local.href;
  }
  return src;
}

export const LibraryMediaCard = memo(function LibraryMediaCard({ item, folder, onNotice, onPreview, onInsert, onDragChange, onMove }: {
  item: LibraryEntry;
  onMove?: () => void;
  folder: string;
  onNotice: (notice: string) => void;
  onPreview: (item: LibraryEntry) => void;
  onInsert?: (item: LibraryMedia) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const [selectedUrl, setSelectedUrl] = useState('');
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());
  const [videoBroken, setVideoBroken] = useState(false);

  const rawViews = item.views ?? [];
  const validViews = rawViews.filter(angle => Boolean(angle.url) && !brokenUrls.has(angle.url));
  const index = Math.max(0, validViews.findIndex(angle => angle.url === selectedUrl));
  const view = validViews[index];
  const sceneFolder = item.folders.find(path => path.startsWith('场景/'));
  const personaFolder = item.folders.some(path => path === '人物' || path.startsWith('人物/')) || item.sources?.some(s => s.type === 'persona');
  const actionFolder = item.kind === 'script' || item.folders.some(path => path === '动作' || path.startsWith('动作/'));
  const multiView = validViews.length > 1;
  const start = Math.floor(index / 4) * 4;

  function step(direction: number) {
    if (!validViews.length) return;
    setSelectedUrl(validViews[(index + direction + validViews.length) % validViews.length].url);
  }

  function markBroken(url: string) {
    if (!url) return;
    setBrokenUrls(prev => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  const current = view && view.url !== item.url
    ? { ...item, url: view.url, name: item.name + ' · ' + view.label, cover: undefined } : item;
  const rawThumbnail = view?.url || item.cover || (item.kind === 'image' ? item.url : '');
  const thumbnail = rawThumbnail && !brokenUrls.has(rawThumbnail) ? rawThumbnail : '';
  const rawPreviewVideo = item.kind === 'script' ? item.record.depthVideoUrl : item.kind === 'video' ? item.url : '';
  const previewVideo = rawPreviewVideo && !videoBroken ? rawPreviewVideo : '';

  const FallbackIcon = personaFolder ? UserRound : sceneFolder ? MountainSnow : actionFolder ? Clapperboard : item.kind === 'audio' ? Music4 : item.kind === 'video' ? Video : ImageIcon;
  const actionMeta = item.kind === 'script' ? classifyActionScript(item.record) : null;
  const categoryTags = actionMeta
    ? [actionMeta.depth, actionMeta.style]
    : ['人物', '场景', '动作'].filter(tag =>
      item.folders.some(path => path === tag || path.startsWith(tag + '/')) ||
      item.sources?.some(source => ({ persona: '人物', scene: '场景', script: '动作', action: '动作', local: '', sound: '' }[source.type]) === tag)
    );
  const subtitle = actionMeta && item.kind === 'script'
    ? `${Math.max(1, Math.round(item.record.script.durationSec))}秒 · ${item.record.script.shots.length}个镜头`
    : sceneFolder
      ? sceneFolder.slice('场景/'.length).replace(/^室外$/, '户外') + '场景'
      : (item.folders[0]?.replace(/^场景\/室外/, '场景/户外') || mediaLabels[item.kind]);

  return <article className={sceneFolder ? 'bml-scene' : undefined} draggable={!!onDragChange && current.kind !== 'script'} onDragStart={event => {
    if (current.kind === 'script') return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(mediaDragType, JSON.stringify({ name: current.name, kind: current.kind, url: current.url, cover: current.cover }));
    requestAnimationFrame(() => onDragChange?.(true));
  }} onDragEnd={() => onDragChange?.(false)}>
    <div className="bml-card-media">
      <div className="bml-hero">
        <div className="bml-card-actions">
          {onMove && <button type="button" className="bml-action-pill" title="移动到分类" aria-label={'移动 ' + item.name} onClick={onMove}>
            <FolderInput size={13}/><span>移动</span>
          </button>}
          {current.kind !== 'script' && <MediaReplaceControl item={current} folder={item.classificationMoved ? '' : folder} onNotice={onNotice}/>}
          {item.sources && <MediaDeleteControl sources={item.sources} folder={item.classificationMoved ? '' : folder} onNotice={onNotice}/>}
        </div>
        {current.kind === 'audio' ? (
          <InlineAudioCard item={current} />
        ) : (
          <button type="button" className="bml-preview" aria-label={'预览 ' + current.name} onClick={() => onPreview(current)}>
            {thumbnail ? (
              <img src={libraryThumbnail(thumbnail, 640)} draggable={false} loading="lazy" decoding="async" alt="" onError={() => markBroken(thumbnail)}/>
            ) : previewVideo ? (
              <video src={proxyMediaUrl(previewVideo, { asVideo: true })} preload="metadata" muted playsInline aria-hidden onError={() => setVideoBroken(true)}/>
            ) : (
              <span className="bml-fallback-cover" data-kind={personaFolder ? 'persona' : sceneFolder ? 'scene' : item.kind}>
                <span className="bml-fallback-icon"><FallbackIcon size={26} strokeWidth={1.6}/></span>
                <span className="bml-fallback-label">{categoryTags[0] || mediaLabels[item.kind]}</span>
              </span>
            )}
          </button>
        )}
        {multiView && <>
          <button type="button" className="bml-angle-step prev" aria-label="上一个视角" onClick={() => step(-1)}><ChevronLeft size={15}/></button>
          <button type="button" className="bml-angle-step next" aria-label="下一个视角" onClick={() => step(1)}><ChevronRight size={15}/></button>
        </>}
      </div>
      {multiView && <div className="bml-angles" role="group" aria-label={item.name + '的视角'}>
        {validViews.slice(start, start + 4).map(angle => <button type="button" key={angle.url} title={angle.label} aria-label={angle.label}
          aria-pressed={angle.url === view.url} onClick={() => setSelectedUrl(angle.url)}>
          <img src={libraryThumbnail(angle.url, 160)} draggable={false} loading="lazy" decoding="async" alt="" onError={() => markBroken(angle.url)}/>
        </button>)}
      </div>}
    </div>
    <div className="bml-caption">
      <div className="bml-caption-top">
        <strong title={item.name}>{item.name}</strong>
        {current.kind === 'script'
          ? <button type="button" className="bml-insert" onClick={() => onPreview(current)}>查看分镜脚本</button>
          : onInsert && <button type="button" className="bml-insert" onClick={() => onInsert(current)}>使用此素材</button>}
      </div>
      <div className="bml-meta-row">
        {!!categoryTags.length && <div className="bml-tags">{categoryTags.map(tag => <span key={tag}>{tag}</span>)}</div>}
        <small title={subtitle}>{subtitle}</small>
      </div>
    </div>
  </article>;
});

export interface FilterDropdownOption {
  value: string;
  label: string;
  count: number;
}

export function MediaFilterDropdown({ prefix, value, resetValue = '', options, onChange }: {
  prefix: string;
  value: string;
  resetValue?: string;
  options: FilterDropdownOption[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeOption = options.find(opt => opt.value === value);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!options.length) return null;

  return (
    <div ref={wrapRef} className={`bml-dropdown${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="bml-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={prefix + '筛选'}
        onClick={() => setOpen(prev => !prev)}
      >
        {activeOption ? (
          <>
            <span className="bml-dropdown-prefix">{prefix}</span>
            <strong className="bml-dropdown-current">{activeOption.label}</strong>
            <span className="bml-dropdown-badge">{activeOption.count}</span>
          </>
        ) : (
          <strong className="bml-dropdown-current">{prefix}</strong>
        )}
        <ChevronDown size={14} className="bml-dropdown-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="bml-dropdown-menu" role="listbox" aria-label={prefix + '选项'}>
          {options.map(opt => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`bml-dropdown-option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(selected ? resetValue : opt.value);
                  setOpen(false);
                }}
              >
                <span className="bml-dropdown-check">{selected && <Check size={13} />}</span>
                <span className="bml-dropdown-option-label">{opt.label}</span>
                <span className="bml-dropdown-option-count">{opt.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MediaMoveDialog({ items, source, folders, onClose, onMoved }: {
  items: LibraryEntry[]; source: string; folders: string[]; onClose: () => void; onMoved: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const targets = folders.filter(path => {
    const kind = mediaFolderKinds[path.split('/')[0]];
    return path !== source && (!kind || items.every(item => item.kind === kind));
  });
  const target = targets.includes(destination) ? destination : targets[0] || '';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="bml-move-dialog" aria-label="移动素材到分类" onCancel={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      try { moveLibraryMedia(items, source, target, folders); onMoved(target); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '移动失败，请重试'); }
    }}>
      <h3>移动 {items.length} 项素材</h3>
      <p>{source ? '从「' + source + '」移动，其他分类中的归属保留。' : '将所选素材统一归入目标分类。'}</p>
      {targets.length ? <label>目标分类<select autoFocus aria-label="素材移动目标分类" value={target}
        onChange={event => { setDestination(event.target.value); setError(''); }}>
        {targets.map(path => <option key={path} value={path}>{path}</option>)}
      </select></label> : <p>没有适合这些素材的目标分类，请先新建分类。</p>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button type="submit" disabled={!target}>移动</button>
      </footer>
    </form>
  </dialog>;
}

export function MediaLibraryResults({ items, folder, folders, onNotice, onMoved, onPreview, onInsert, onDragChange }: {
  items: LibraryEntry[]; folder: string; folders: string[];
  onNotice: (message: string) => void; onMoved: (path: string) => void; onPreview: (item: LibraryEntry) => void;
  onInsert?: (item: LibraryMedia) => void; onDragChange?: (dragging: boolean) => void;
}) {
  const [moving, setMoving] = useState<LibraryEntry[] | null>(null);
  return <>
    <div className="bml-items grid">
      {items.map(item => {
        const key = libraryMediaKey(item);
        return <LibraryMediaCard key={key} item={item} folder={folder} onNotice={onNotice}
          onMove={() => setMoving([item])}
          onPreview={onPreview} onInsert={onInsert} onDragChange={onDragChange}/>;
      })}
    </div>
    {moving && <MediaMoveDialog items={moving} source={folder} folders={folders} onClose={() => setMoving(null)}
      onMoved={path => { setMoving(null); onNotice('已移动 ' + moving.length + ' 项素材到「' + path + '」'); onMoved(path); }}/>}
  </>;
}

export function ScriptDetail({ item, folder, onClose, onNotice, collectionControls }: {
  item: ScriptEntry;
  folder: string;
  collectionControls?: ReactNode;
  onNotice: (value: string) => void;
  onClose: () => void;
}) {
  const { script, depthVideoUrl } = item.record;
  const shots = useMemo(() => buildScriptStoryboard(script), [script]);
  const [index, setIndex] = useState(0);
  const [failedUrl, setFailedUrl] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  const dialogRef = useModalDialog(true, onClose, { initialFocusSelector: '[aria-label="关闭动作详情"]' });
  const playbackUrl = depthVideoUrl && proxyMediaUrl(depthVideoUrl, { asVideo: true });
  const shot = shots[index];

  function selectShot(next: number) {
    setIndex(next);
    if (player.current && player.current.readyState >= 1) {
      player.current.currentTime = shots[next].segments[0].beat.start;
    }
  }

  return <div ref={dialogRef} tabIndex={-1} className="bml-script-detail" role="dialog" aria-modal="true" aria-label="动作脚本详情">
    <div className="bml-script-heading">
      <div><small>动作 / 分镜脚本</small><h2>{item.name}</h2></div>
      {collectionControls}
      <div className="bml-detail-actions">
        {item.sources && <MediaDeleteControl sources={item.sources} folder={item.classificationMoved ? '' : folder} onDeleted={onClose} onNotice={onNotice}/>}
        <button onClick={onClose} aria-label="关闭动作详情"><X size={18}/></button>
      </div>
    </div>
    <div className="bml-script-columns">
      <section className="bml-shot-player" aria-label="深度分镜视频">
        <h3>深度动作视频</h3>
        {playbackUrl && depthVideoUrl !== failedUrl ? <video key={depthVideoUrl} ref={player} controls playsInline preload="metadata" aria-label="深度动作视频"
          src={playbackUrl}
          onError={() => setFailedUrl(depthVideoUrl || '')}
          onLoadedMetadata={event => { if (shot) event.currentTarget.currentTime = shot.segments[0].beat.start; }}
          onTimeUpdate={event => {
            const time = event.currentTarget.currentTime;
            const next = shots.findIndex(({ segments: [{ beat }] }) => time >= beat.start && time < beat.end);
            if (next >= 0) setIndex(next);
          }}/> : depthVideoUrl ? <>
          <p role="status">深度视频加载失败。</p>
          <button type="button" onClick={() => setFailedUrl('')}>重新加载深度视频</button>
        </> : <p role="status">{item.record.depthTaskId ? '深度任务已提交，等待结果入库。' : '此脚本尚未关联深度视频。可在动作导入中选择同一文件，启用深度转换。'}</p>}
        {shot && <small>分镜 {shot.number} · {shot.range}</small>}
        {shot?.segments[0].beat.actionTemplate && <div className="bml-action-cue"><h4>本段复用动作</h4><p>{shot.segments[0].beat.actionTemplate}</p></div>}
      </section>
      <section className="bml-shot-document" aria-label="分镜表">
        <h3>分镜总览</h3>
        <p className="bml-shot-stats">全长 {script.durationSec} 秒 · {script.shots.length} 个镜头 · {shots.length} 段动作</p>
        <SalesStoryboardTable rows={shots} selected={index} onSelect={selectShot}/>
        {(script.overview || script.visualSpec.styleSummary || script.visualSpec.lighting) && <section className="bml-shot-context">
          <h3>全片概述与拍摄风格</h3><p>{script.overview}</p>
          {(script.visualSpec.styleSummary || script.visualSpec.lighting) && <p>{storyboardStyle(script)}</p>}
        </section>}
      </section>
    </div>
  </div>;
}

export function MediaCollectionControls({ item, folder, saved, onDone }: {
  item: LibraryEntry; folder: string; saved: string[]; onDone: (message: string, path: string) => void;
}) {
  const paths = saved.filter(path => {
    const kind = mediaFolderKinds[path.split('/')[0]];
    return !kind || item.kind === kind;
  });
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const target = paths.includes(selected) ? selected : paths[0];
  if (!target) return null;
  return (
    <div className="bml-collect">
      <select aria-label="目标文件夹" value={target} onChange={e => setSelected(e.target.value)}>
        {paths.map(path => (
          <option key={path}>{path}</option>
        ))}
      </select>
      <button
        onClick={() => {
          try {
            collectCustomMedia(item.name, item.url, item.kind, target);
            onDone('素材已加入文件夹', target);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '收藏未保存');
          }
        }}
      >
        加入文件夹
      </button>
      {saved.includes(folder) && item.folders.includes(folder) && (
        <button
          onClick={() => {
            try {
              removeCollectedMedia(item.url, folder);
              onDone('已从文件夹移出', folder);
            } catch {
              setError('移出失败');
            }
          }}
        >
          移出此文件夹
        </button>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
