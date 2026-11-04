import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { PetPose } from '@shared/domain/pets/atlas';
import type { PetSummary } from '@shared/contracts/pets';
import { BeikePet } from '@client/shared/pets/BeikePet';
import { fetchPets, forgetPetSheet, petSheetURL } from '@client/shared/pets/petClient';
import { PET_SIZES, beikePhaseFor, updatePetPreferences, usePetPreferences, type PetSizeName } from '@client/shared/pets/petPreferences';
import { PetSprite } from '@client/shared/pets/PetSprite';
import { PetImportForm } from './PetImportForm';

const LOCAL_PETS: PetChoice[] = [
  { id: 'none', displayName: '无', description: '不显示虚拟形象。封面页仍可从工具栏投喂样张。' },
  { id: 'beike', displayName: '贝壳', description: '原来的紫色喂图小怪兽，会跟着生成和投喂变化。' },
];

const SIZE_OPTIONS: [PetSizeName, string][] = [['sm', '小'], ['md', '中'], ['lg', '大']];
const POSE_OPTIONS: [PetPose, string][] = [['idle', '待机'], ['working', '工作'], ['look', '视线']];
const CARD_SPRITE = 104;

interface PetChoice {
  id: string;
  displayName: string;
  description: string;
  author?: string;
  spriteVersion?: 1 | 2;
}

export function petChoices(remote: PetSummary[]): PetChoice[] {
  return [
    ...LOCAL_PETS,
    ...remote.map((pet) => ({
      id: pet.id, displayName: pet.displayName, description: pet.description, author: pet.author, spriteVersion: pet.spriteVersion,
    })),
  ];
}

export function PetSettingsPanel() {
  const preferences = usePetPreferences();
  const [listed, setListed] = useState(false);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState<PetPose>('idle');
  const [look, setLook] = useState(4);
  const [sheet, setSheet] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [retrySheet,setRetrySheet] = useState(0);
  const selected = pets.find((pet) => pet.id === preferences.petId);
  const shown = preferences.visible && preferences.petId !== 'none';
  const poseValue: PetPose = preview === 'look' && selected?.spriteVersion === 1 ? 'idle' : preview;
  const reload = () => {
    setLoadError('');
    return fetchPets().then(setPets).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : '无法读取桌宠'));
  };
  const toggleVisible = () => updatePetPreferences(shown ? { visible: false } : { visible: true, petId: preferences.petId === 'none' ? 'beike' : preferences.petId });
  useEffect(() => {
    let cancel = false;
    fetchPets().then((next) => { if (!cancel) {setPets(next);setListed(true);} }).catch((error: unknown) => {
      if (!cancel) setLoadError(error instanceof Error ? error.message : '无法读取桌宠');
    });
    return () => { cancel = true; };
  }, []);
  useEffect(() => {
    if (poseValue !== 'look') return undefined;
    const timer = window.setInterval(() => setLook((value) => (value + 1) % 16), 450);
    return () => window.clearInterval(timer);
  }, [poseValue]);
  useEffect(() => {
    setSheet('');setSheetError('');
    if (!selected) return;
    let cancel = false;
    petSheetURL(selected.id).then(url => { if (!cancel) setSheet(url); }).catch(() => {
      if (!cancel) setSheetError('桌宠图片加载失败');
    });
    return () => { cancel = true; };
  }, [selected,retrySheet]);
  const choices = petChoices(pets);
  const previewSize = PET_SIZES[preferences.size];
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">贝壳云图桌宠</h2>
      {loadError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{loadError}<button type="button" className="ml-3 underline" onClick={() => void reload()}>重试</button></p>}
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 dark:border-white/10 dark:bg-white/[0.03] sm:px-6">
        <div className="flex h-48 items-center justify-center">
          {preferences.petId === 'none' ? <p className="text-sm text-slate-500">未选择桌宠</p> : preferences.petId === 'beike' ? (
            <BeikePet decorative phase={beikePhaseFor(preview)} lookIndex={preview === 'look' ? look : null} label="桌宠预览" onOpen={() => undefined} onFiles={() => undefined} size={previewSize} />
          ) : sheet && !sheetError ? (
            <div style={{ width: previewSize, height: Math.round(previewSize * 208 / 192) }}>
              <PetSprite src={sheet} version={selected?.spriteVersion || 2} pose={poseValue} lookIndex={poseValue === 'look' ? look : null} size={previewSize} onError={()=>setSheetError('桌宠图片加载失败')}/>
            </div>
          ) : <p className="text-sm text-slate-500">{sheetError || loadError || (!listed || selected ? '正在准备预览' : '未找到选中的桌宠，可在下方重新选择。')}{sheetError && <button className="ml-2 underline" onClick={()=>{forgetPetSheet(preferences.petId);setRetrySheet(n=>n+1);}}>重试</button>}</p>}
        </div>
        <div className="settings-preview-list">
          <div className="settings-preview-row"><span>显示桌宠</span>
            <button type="button" role="switch" aria-label="显示桌宠" aria-checked={shown} className={`settings-switch ${shown ? 'is-on' : ''}`} onClick={toggleVisible}><span/></button>
          </div>
          <div className="settings-preview-row"><div>在画布显示<p className="text-xs text-slate-500">点击桌宠打开画布助手，右键打开桌宠设置。</p></div>
            <button type="button" role="switch" aria-label="在画布显示" disabled={!shown} aria-checked={shown && preferences.canvasVisible} className={`settings-switch ${shown && preferences.canvasVisible ? 'is-on' : ''}`} onClick={()=>updatePetPreferences({canvasVisible:!preferences.canvasVisible})}><span/></button>
          </div>
          <div className="settings-preview-row"><span>快捷预览</span>
            <div className="settings-segment" role="group" aria-label="快捷预览">{POSE_OPTIONS.map(([id,label])=>
              <button key={id} type="button" disabled={id === 'look' && selected?.spriteVersion === 1} aria-pressed={poseValue===id} onClick={()=>setPreview(id)}>{label}</button>)}</div>
          </div>
          <div className="settings-preview-row"><span>显示大小</span>
            <div className="settings-segment" role="group" aria-label="显示大小">{SIZE_OPTIONS.map(([size,label])=>
              <button key={size} type="button" aria-pressed={preferences.size===size} onClick={()=>updatePetPreferences({size})}>{label}</button>)}</div>
          </div>
          <div className="settings-preview-row"><div>画布联动<p className="text-xs text-slate-500">全开时响应节点和连线变化；仅生成时只响应当前项目的任务。</p></div>
            <div className="settings-segment" role="group" aria-label="画布联动">{([['all','全开'],['generation','仅生成'],['off','关闭']] as const).map(([mode,label])=>
              <button key={mode} type="button" aria-pressed={preferences.canvasLink===mode} onClick={()=>updatePetPreferences({canvasLink:mode})}>{label}</button>)}</div>
          </div>
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">我的桌宠</h3>
          <button type="button" aria-label="刷新桌宠" onClick={() => void reload()} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"><RefreshCw size={14} /></button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {choices.map((pet) => (
            <PetChoiceCard key={pet.id} pet={pet} pressed={preferences.petId === pet.id} onSelect={() => updatePetPreferences({ petId: pet.id, visible: pet.id !== 'none' })} />
          ))}
        </div>
      </section>
      <section>
        <button type="button" aria-expanded={importOpen} onClick={() => setImportOpen((open) => !open)} className="text-sm font-semibold text-slate-900 dark:text-white">用命令导入</button>
        {importOpen && <div className="mt-3"><PetImportForm onImported={() => void reload()} /></div>}
      </section>
    </div>
  );
}

function PetChoiceCard({ pet, pressed, onSelect }: { pet: PetChoice; pressed: boolean; onSelect: () => void }) {
  const [sheet, setSheet] = useState('');
  const sprite = pet.id !== 'none' && pet.id !== 'beike';
  useEffect(() => {
    if (!sprite) return undefined;
    let cancel = false;
    petSheetURL(pet.id).then((url) => { if (!cancel) setSheet(url); }).catch(() => { if (!cancel) setSheet(''); });
    return () => { cancel = true; };
  }, [pet.id, sprite]);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={pressed}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      className={`rounded-2xl border bg-white p-4 text-center dark:bg-transparent ${pressed ? 'border-slate-900 shadow-sm dark:border-white' : 'border-slate-200 dark:border-white/10'}`}
    >
      <span className="flex h-36 items-center justify-center">
        {pet.id === 'beike' ? (
          <BeikePet decorative phase="idle" label={pet.displayName} onOpen={() => undefined} onFiles={() => undefined} size={92} />
        ) : sheet ? (
          <span style={{ width: CARD_SPRITE, height: Math.round(CARD_SPRITE * 208 / 192) }} className="block">
            <PetSprite src={sheet} version={pet.spriteVersion || 2} pose="idle" lookIndex={null} size={CARD_SPRITE} paused />
          </span>
        ) : null}
      </span>
      <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{pet.displayName}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{pet.description}</span>
      {pet.author && <span className="mt-2 block text-[11px] text-slate-400">{pet.author}</span>}
    </div>
  );
}
