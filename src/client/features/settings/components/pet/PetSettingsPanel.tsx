import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { PetPose } from '@shared/domain/pets/atlas';
import type { PetSummary } from '@shared/contracts/pets';
import { BeikePet } from '@client/shared/pets/BeikePet';
import { fetchPets, petSheetURL } from '@client/shared/pets/petClient';
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
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState<PetPose>('idle');
  const [look, setLook] = useState(4);
  const [sheet, setSheet] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = pets.find((pet) => pet.id === preferences.petId);
  const shown = preferences.visible && preferences.petId !== 'none';
  const sizeLabel = SIZE_OPTIONS.find(([id]) => id === preferences.size)?.[1] || '中';
  const poseValue: PetPose = preview === 'working' || preview === 'look' ? preview : 'idle';
  const reload = () => {
    setLoadError('');
    return fetchPets().then(setPets).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : '无法读取桌宠'));
  };
  const toggleVisible = () => updatePetPreferences(shown ? { visible: false } : { visible: true, petId: preferences.petId === 'none' ? 'beike' : preferences.petId });
  const cycleSize = () => {
    const index = SIZE_OPTIONS.findIndex(([id]) => id === preferences.size);
    updatePetPreferences({ size: SIZE_OPTIONS[(index + 1) % SIZE_OPTIONS.length][0] });
  };
  useEffect(() => {
    let cancel = false;
    fetchPets().then((next) => { if (!cancel) setPets(next); }).catch((error: unknown) => {
      if (!cancel) setLoadError(error instanceof Error ? error.message : '无法读取桌宠');
    });
    return () => { cancel = true; };
  }, []);
  useEffect(() => {
    if (preview !== 'look') return undefined;
    const timer = window.setInterval(() => setLook((value) => (value + 1) % 16), 450);
    return () => window.clearInterval(timer);
  }, [preview]);
  useEffect(() => {
    if (!selected) { setSheet(''); return undefined; }
    let cancel = false;
    petSheetURL(selected.id).then((url) => { if (!cancel) setSheet(url); }).catch(() => { if (!cancel) setSheet(''); });
    return () => { cancel = true; };
  }, [selected]);
  useEffect(() => {
    if (!actionOpen) return undefined;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setActionOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [actionOpen]);

  const choices = petChoices(pets);
  const previewSize = PET_SIZES[preferences.size];
  return (
    <div className="space-y-8">
      <PetImportForm onImported={() => void reload()} />
      {loadError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{loadError}<button type="button" className="ml-3 underline" onClick={() => void reload()}>重试</button></p>}
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 dark:border-white/10 dark:bg-white/[0.03] sm:px-6">
        <div className="flex h-48 items-center justify-center">
          {preferences.petId === 'none' ? <p className="text-sm text-slate-500">未选择桌宠</p> : preferences.petId === 'beike' ? (
            <BeikePet decorative phase={beikePhaseFor(preview)} label="桌宠预览" onOpen={() => undefined} onFiles={() => undefined} size={previewSize} />
          ) : sheet ? (
            <div style={{ width: previewSize, height: Math.round(previewSize * 208 / 192) }}>
              <PetSprite src={sheet} version={selected?.spriteVersion || 2} pose={preview} lookIndex={preview === 'look' ? look : null} size={previewSize} />
            </div>
          ) : <p className="text-sm text-slate-500">{loadError || '正在准备预览'}</p>}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span />
          <div ref={menuRef} className="relative">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#1c1c1f]">
              <button type="button" aria-pressed={shown} aria-label="显示桌宠" onClick={toggleVisible} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10">
                {shown ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-white/10" />
              <button type="button" aria-label={`显示大小 ${sizeLabel}`} onClick={cycleSize} className="min-w-8 px-2 text-xs font-medium text-slate-700 dark:text-slate-100">{sizeLabel}</button>
              <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-white/10" />
              <button type="button" aria-label="动作预览" aria-haspopup="menu" aria-expanded={actionOpen} onClick={() => setActionOpen((open) => !open)} className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10">
                <ChevronDown size={15} />
              </button>
            </div>
            {actionOpen && (
              <div role="menu" className="absolute left-1/2 top-full z-10 mt-2 w-28 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-[#1b1b1e]">
                {POSE_OPTIONS.map(([id, label]) => (
                  <button key={id} type="button" role="menuitem" aria-pressed={poseValue === id} onClick={() => { setPreview(id); setActionOpen(false); }} className={`block w-full px-3 py-1.5 text-left ${poseValue === id ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="justify-self-end">
            <button type="button" aria-expanded={customOpen} onClick={() => setCustomOpen((open) => !open)} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 dark:border-white/15 dark:bg-transparent dark:text-slate-200">自定义</button>
          </div>
        </div>
        {customOpen && (
          <div className="mx-auto mt-5 max-w-md space-y-3">
            <Control label="显示桌宠"><button type="button" role="switch" aria-checked={shown} aria-label="显示桌宠" className={`settings-switch ${shown ? 'is-on' : ''}`} onClick={toggleVisible}><span /></button></Control>
            <Control label="显示大小"><Segment options={SIZE_OPTIONS} value={preferences.size} onChange={(size) => updatePetPreferences({ size: size as PetSizeName })} /></Control>
            <Control label="动作预览"><Segment options={POSE_OPTIONS} value={poseValue} onChange={(pose) => setPreview(pose as PetPose)} /></Control>
          </div>
        )}
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

function Control({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>{children}</div>;
}

function Segment({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="settings-segment" role="group" aria-label={options.map((item) => item[1]).join(' ')}>
      {options.map(([id, label]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}
