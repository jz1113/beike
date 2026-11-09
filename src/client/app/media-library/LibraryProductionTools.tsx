import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderInput, Loader2, Music4, Settings2, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { collectCustomMedia } from '@client/features/assets/model/customAssetStore';
import { createSalesSound, type SalesStudioAssetCatalog } from '@client/features/sales/api/salesMaterials';
import '@client/features/sales/salesStudio.css';
import '@client/features/sales/salesLibrary.css';
import '@client/features/sales/salesProduct.css';
import '@client/features/sales/salesPrompts.css';
import { SalesPersonaDialog } from '@client/features/sales/components/SalesPersonaDialog';
import { SalesSceneDialog } from '@client/features/sales/components/SalesSceneDialog';
import { SalesImageImportDialog } from '@client/features/sales/components/SalesImageImportDialog';
import { SalesPromptWorkspace } from '@client/features/sales/components/SalesPromptWorkspace';
import { SalesScriptBatchImportDialog } from '@client/features/sales/components/SalesScriptBatchImportDialog';
import { salesFocusClass, salesGhostButtonClass } from '@client/features/sales/components/salesChrome';
import { useSalesSummaryModels } from '@client/features/sales/hooks/useSalesAssetViews';
import { useSalesPrompts } from '@client/features/sales/hooks/useSalesPrompts';
import { useSalesScriptImport } from '@client/features/sales/hooks/useSalesScriptImport';
import {
  PERSONA_CATEGORIES,
  PERSONA_GENDERS,
  personaCategory,
  personaGender,
  type PersonaAge,
  type PersonaCategory,
} from '@client/features/sales/model/salesActionViews';
import { personaFolder } from './mediaFolders';

type Dialog = 'analysis' | 'generate' | 'images' | 'sound' | 'skills';

export interface ImportedTargetFilter {
  folder: string;
  personaAge?: string;
  voiceGender?: string;
  voiceAge?: string;
}

const AGE_MAP: Record<string, PersonaAge> = {
  青年: 'young',
  中年: 'middle',
  老年: 'senior',
  儿童: 'child',
  幼年: 'child',
};

const AGE_LABEL_BY_ID: Record<PersonaAge, string> = {
  young: '青年',
  middle: '中年',
  senior: '老年',
  child: '儿童',
};

const SOUND_AGE_OPTIONS: Array<{ id: PersonaAge; label: string }> = [
  { id: 'young', label: '青年' },
  { id: 'middle', label: '中年' },
  { id: 'senior', label: '老年' },
  { id: 'child', label: '儿童' },
];

const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/ogg,audio/opus,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus';

interface SoundQueueItem {
  key: string;
  file: File;
  name: string;
  audioUrl?: string;
  status: 'queued' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
}

const SOUND_STATUS = {
  queued: '待导入',
  uploading: '上传中…',
  saving: '保存中…',
  done: '已入库',
  error: '导入失败',
} as const;

function cleanAudioFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || '音频素材';
}

function LibrarySoundImportDialog({
  initialFiles = [],
  defaultSoundType,
  defaultVoiceGroup,
  onClose,
  onImported,
}: {
  initialFiles?: File[];
  defaultSoundType: 'voice' | 'bgm';
  defaultVoiceGroup: PersonaCategory;
  onClose: () => void;
  onImported: (count: number, target: ImportedTargetFilter, label: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [soundType, setSoundType] = useState<'voice' | 'bgm'>(defaultSoundType);
  const [voiceGroup, setVoiceGroup] = useState<PersonaCategory>(defaultVoiceGroup);
  const [items, setItems] = useState<SoundQueueItem[]>(() =>
    initialFiles
      .filter(f => /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name) || f.type.startsWith('audio/'))
      .map(file => ({
        key: `sound-import-${crypto.randomUUID()}`,
        file,
        name: cleanAudioFileName(file.name),
        status: 'queued',
      })),
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const activeGender = personaGender(voiceGroup);
  const activeAge: PersonaAge = voiceGroup === activeGender ? 'young' : (voiceGroup.split('_')[0] as PersonaAge);
  const genderLabel = activeGender === 'male' ? '男' : '女';
  const ageLabel = AGE_LABEL_BY_ID[activeAge];
  const targetLabel = soundType === 'bgm' ? '声音 / BGM' : `声音 / 人声（${genderLabel} · ${ageLabel}）`;
  const done = items.filter(item => item.status === 'done').length;
  const remaining = items.length - done;

  useEffect(() => {
    dialog.current?.showModal();
    return () => operation.current?.abort();
  }, []);

  function addFiles(chosen: File[]) {
    if (pending || operation.current) return;
    const valid = chosen.filter(f => /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name) || f.type.startsWith('audio/'));
    if (!valid.length && chosen.length) {
      setError('请选择 MP3、WAV、M4A、AAC、FLAC、OGG 或 OPUS 格式的音频文件');
      return;
    }
    setError('');
    setItems(prev => [
      ...prev,
      ...valid.map(file => ({
        key: `sound-import-${crypto.randomUUID()}`,
        file,
        name: cleanAudioFileName(file.name),
        status: 'queued' as const,
      })),
    ]);
  }

  async function submit() {
    if (pending || operation.current || !remaining) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setError('');
    let saved = 0;
    try {
      for (const item of items) {
        if (controller.signal.aborted) break;
        if (item.status === 'done') continue;
        try {
          let audioUrl = item.audioUrl;
          if (!audioUrl) {
            setItems(prev => prev.map(entry => (entry.key === item.key ? { ...entry, status: 'uploading', error: '' } : entry)));
            audioUrl = await uploadStudioFile(item.file, 'canvas-library', controller.signal);
            setItems(prev => prev.map(entry => (entry.key === item.key ? { ...entry, audioUrl } : entry)));
          }
          setItems(prev => prev.map(entry => (entry.key === item.key ? { ...entry, status: 'saving', error: '' } : entry)));
          try {
            await createSalesSound(
              soundType === 'bgm'
                ? { soundType: 'bgm', title: item.name, name: item.name, audioUrl, moodTags: ['BGM'] }
                : {
                    soundType: 'voice',
                    name: item.name,
                    title: item.name,
                    audioUrl,
                    gender: activeGender,
                    voiceGroup,
                    tags: [genderLabel, ageLabel],
                  },
              controller.signal,
            );
          } catch {
            collectCustomMedia(
              item.name,
              audioUrl,
              'audio',
              soundType === 'bgm' ? '声音/BGM' : '声音/人声',
              false,
              soundType === 'bgm' ? ['BGM'] : [genderLabel, ageLabel],
            );
          }
          saved++;
          setItems(prev => prev.map(entry => (entry.key === item.key ? { ...entry, status: 'done', error: '' } : entry)));
        } catch (err) {
          if (controller.signal.aborted) break;
          setItems(prev =>
            prev.map(entry =>
              entry.key === item.key
                ? { ...entry, status: 'error', error: err instanceof Error ? err.message : '导入失败，请重试' }
                : entry,
            ),
          );
        }
      }
      if (!controller.signal.aborted && saved > 0) {
        invalidateGlobalAssetCache();
        onImported(
          saved,
          soundType === 'bgm'
            ? { folder: '声音/BGM', voiceGender: '', voiceAge: '' }
            : { folder: '声音/人声', voiceGender: genderLabel, voiceAge: ageLabel },
          targetLabel,
        );
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="sales-material-dialog sales-asset-dialog sales-bgm-import"
      aria-labelledby="sales-sound-import-title"
      onCancel={event => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="sales-asset-header">
          <h2 id="sales-sound-import-title">批量导入声音</h2>
          <button type="button" disabled={pending} aria-label="关闭声音批量导入" onClick={onClose} className={salesGhostButtonClass}>
            <X size={18} />
          </button>
        </header>
        <div className="sales-asset-content">
          <div className="bml-import-target-box" role="group" aria-label="选择声音导入分类">
            <div className="bml-import-target-header">
              <strong>导入归属分类</strong>
              <span>将归入「{targetLabel}」</span>
            </div>
            <div className="bml-import-target-grid">
              <div className="bml-import-target-row">
                <span>类型</span>
                <div className="bml-import-pills">
                  {([
                    { id: 'voice', label: '人声' },
                    { id: 'bgm', label: 'BGM' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={pending}
                      aria-pressed={soundType === opt.id}
                      className={`bml-import-pill${soundType === opt.id ? ' is-active' : ''}`}
                      onClick={() => setSoundType(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {soundType === 'voice' && (
                <>
                  <div className="bml-import-target-row">
                    <span>性别</span>
                    <div className="bml-import-pills">
                      {PERSONA_GENDERS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          disabled={pending}
                          aria-pressed={activeGender === id}
                          className={`bml-import-pill${activeGender === id ? ' is-active' : ''}`}
                          onClick={() => setVoiceGroup(personaCategory(id, activeAge))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bml-import-target-row">
                    <span>年龄段</span>
                    <div className="bml-import-pills">
                      {SOUND_AGE_OPTIONS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          disabled={pending}
                          aria-pressed={activeAge === id}
                          className={`bml-import-pill${activeAge === id ? ' is-active' : ''}`}
                          onClick={() => setVoiceGroup(personaCategory(activeGender, id))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <input
            ref={input}
            className="hidden"
            type="file"
            multiple
            accept={AUDIO_ACCEPT}
            disabled={pending}
            aria-label="选择一批音频文件"
            onChange={event => {
              addFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={pending}
            className={`sales-bgm-dropzone ${salesFocusClass}`}
            onClick={() => input.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <Upload size={24} aria-hidden />
            <strong>{items.length ? '继续添加音频' : '选择或拖入一批音频'}</strong>
            <span>支持 MP3、WAV、M4A、AAC、FLAC、OGG、OPUS</span>
          </button>
          {error && (
            <p role="alert" className="sales-material-error">
              {error}
            </p>
          )}
          <div className="sales-bgm-import-list" aria-label="声音批量导入队列">
            {items.map(item => (
              <div key={item.key} className="sales-bgm-import-item">
                {item.status === 'done' ? (
                  <Check size={18} aria-hidden />
                ) : item.status === 'uploading' || item.status === 'saving' ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : (
                  <Music4 size={18} aria-hidden />
                )}
                <div className="sales-bgm-import-copy">
                  <strong>{item.name}</strong>
                  <span>{item.file.name}</span>
                  {item.error && (
                    <p role="alert" className="sales-material-error">
                      {item.error}
                    </p>
                  )}
                </div>
                <span role="status">{SOUND_STATUS[item.status]}</span>
                {item.status !== 'done' && (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`移除待导入${item.name}`}
                    className={salesGhostButtonClass}
                    onClick={() => setItems(prev => prev.filter(entry => entry.key !== item.key))}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <footer className="sales-asset-footer">
          <span role="status">
            已入库 {done} / {items.length} · 待处理 {remaining}
          </span>
          <div>
            <button type="button" disabled={pending} className={salesGhostButtonClass} onClick={onClose}>
              {done ? '完成' : '关闭'}
            </button>
            <button type="submit" disabled={pending || !remaining} className={`sales-collect-primary ${salesFocusClass}`}>
              {pending && <Loader2 size={14} className="animate-spin" />}
              {pending ? '正在导入…' : `导入并保存 ${remaining} 项`}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

const prompts = {
  script: ['script-analysis'],
  persona: ['persona-design', 'persona-grid'],
  scene: ['scene-design', 'scene-grid'],
} as const;

function LibrarySkillSettings({kind, onClose}: {kind:keyof typeof prompts; onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const manager = useSalesPrompts(true, prompts[kind]);
  const title = {script:'动作分析',persona:'人物生成',scene:'场景生成'}[kind]+'技能设置';
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function close() {
    if (manager.saving) return;
    if (manager.hasUnsaved && !await confirmAction({title:'放弃未保存的技能修改？', confirmText:'放弃修改', danger:true})) return;
    onClose();
  }
  return <dialog ref={dialog} className="sales-material-dialog bml-skill-settings" aria-label={title}
    onCancel={event=>{event.preventDefault();void close();}}>
    <header><h2>{title}</h2><button aria-label="关闭技能设置" disabled={manager.saving} onClick={()=>void close()}><X size={17}/></button></header>
    <SalesPromptWorkspace manager={manager} showSidebar={false}/>
  </dialog>;
}

export function LibraryProductionTools({
  folder,
  personaAge = '',
  voiceGender = '',
  voiceAge = '',
  catalog,
  onNotice,
  onImportedTarget,
}: {
  folder: string;
  personaAge?: string;
  voiceGender?: string;
  voiceAge?: string;
  catalog: SalesStudioAssetCatalog | null;
  onNotice: (message: string) => void;
  onImportedTarget?: (target: ImportedTargetFilter) => void;
}) {
  const [dialog,setDialog] = useState<Dialog|null>(null);
  const [files,setFiles] = useState<File[]>([]);
  const [preferredModel,setPreferredModel] = useState('');
  const directory = useRef<HTMLInputElement>(null);
  const batch = useSalesScriptImport(invalidateGlobalAssetCache);
  const {model} = useSalesSummaryModels(preferredModel);
  const [root,gender] = folder.split('/');
  const action = root === '动作';
  const persona = root === '人物';
  const sound = root === '声音';
  if (!action && !persona && !sound && root !== '场景') return null;

  const resolvedGender = gender === '男' ? 'male' : 'female';
  const resolvedAge = AGE_MAP[personaAge] ?? 'young';
  const group = (Object.keys(PERSONA_CATEGORIES) as PersonaCategory[]).find(value => personaFolder(value) === folder)
    ?? personaCategory(resolvedGender, resolvedAge);
  const defaultVoiceGroup = personaCategory(voiceGender === '男' ? 'male' : 'female', AGE_MAP[voiceAge] ?? 'young');
  const defaultSoundType = folder === '声音/BGM' ? 'bgm' : 'voice';
  const draftId = folder === root ? undefined : 'new:'+folder;
  const space = folder === '场景/室外' ? 'outdoor' : 'indoor';
  const close = () => { setDialog(null); setFiles([]); };

  return <>
    {action ? <button className="bml-import" onClick={()=>setDialog('analysis')}><Upload size={14}/>
      {batch.pending ? '查看视频分析进度' : '导入视频分析'}</button> : sound ? (
      <button className="bml-import" onClick={()=>setDialog('sound')}><Upload size={14}/>导入声音</button>
    ) : <>
      <button className="bml-import" onClick={()=>setDialog('generate')}><Sparkles size={14}/>{root}生成</button>
      <button onClick={()=>setDialog('images')}><Upload size={14}/>导入{root}</button>
    </>}
    <button disabled={action && batch.pending} onClick={()=>directory.current?.click()}><FolderInput size={14}/>导入文件夹</button>
    {!sound && <button onClick={()=>setDialog('skills')}><Settings2 size={14}/>文案设置</button>}
    <input hidden type="file" multiple ref={el=>{directory.current=el;el?.setAttribute('webkitdirectory','');}}
      onChange={event=>{
        const chosen = Array.from(event.target.files ?? []).filter(file=>!file.name.startsWith('.'));
        event.target.value='';
        if (!chosen.length) return;
        if (action) { batch.addFiles(chosen); setDialog('analysis'); }
        else if (sound) { setFiles(chosen); setDialog('sound'); }
        else { setFiles(chosen); setDialog('images'); }
      }}/>
    {dialog && createPortal(<div className="sales-studio">
      {dialog === 'skills' && !sound && <LibrarySkillSettings kind={action ? 'script' : persona ? 'persona' : 'scene'} onClose={close}/>}
      {dialog === 'analysis' && <SalesScriptBatchImportDialog preferredModel={preferredModel} onModelChange={setPreferredModel}
        items={batch.items} pending={batch.pending} error={batch.error} errors={batch.errors}
        includeDepth={batch.includeDepth} onIncludeDepthChange={batch.setIncludeDepth}
        onAddFiles={batch.addFiles} onRemove={batch.remove} onClearCompleted={batch.clearCompleted}
        onStart={()=>void batch.start(model)} onStop={batch.stop} onClose={close}/>}
      {dialog === 'generate' && (persona
        ? <SalesPersonaDialog draftId={draftId} defaultGroup={group} voices={catalog?.voices ?? []} onClose={close} onSaved={onNotice}/>
        : <SalesSceneDialog draftId={draftId} defaultSpace={space} onClose={close} onSaved={onNotice}/>)}
      {dialog === 'images' && <SalesImageImportDialog kind={persona ? 'persona' : 'scene'}
        existingNames={persona ? catalog?.personas.map(item=>item.name) ?? [] : catalog?.scenes.map(item=>item.title) ?? []}
        initialFiles={files} personaGroup={group} sceneSpace={space} onClose={close}
        onTargetSelected={target => {
          if (persona) {
            const g = personaGender(target.personaGroup) === 'male' ? '男' : '女';
            const aKey: PersonaAge = target.personaGroup === personaGender(target.personaGroup) ? 'young' : (target.personaGroup.split('_')[0] as PersonaAge);
            onImportedTarget?.({ folder: `人物/${g}`, personaAge: AGE_LABEL_BY_ID[aKey] });
          } else {
            onImportedTarget?.({ folder: target.sceneSpace === 'outdoor' ? '场景/室外' : '场景/室内' });
          }
        }}
        onImported={count=>{
          invalidateGlobalAssetCache();
          onNotice(`已导入 ${count} 个${root}资产`);
        }}/>}
      {dialog === 'sound' && (
        <LibrarySoundImportDialog
          initialFiles={files}
          defaultSoundType={defaultSoundType}
          defaultVoiceGroup={defaultVoiceGroup}
          onClose={close}
          onImported={(count, target, label) => {
            onImportedTarget?.(target);
            onNotice(`已导入 ${count} 个声音资产到「${label}」`);
            close();
          }}
        />
      )}
    </div>,document.body)}
  </>;
}
