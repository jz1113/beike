import { useRef, useState } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import { isAvatarDriverModel, avatarMediaKind } from '@shared/domain/models/avatarDrivers';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { StudioComposer } from '@client/shared/ui/studio/StudioComposer';
import { StudioHero } from '@client/shared/ui/studio/StudioHero';
import { StudioModelCapsule } from '@client/shared/ui/StudioModelCapsule';
import { SCRIPT_TEMPLATES } from '../model/avatarTemplates';
import { useAvatarTaskPolling } from '../hooks/useAvatarTaskPolling';
import { useAvatarStore } from '../store/useAvatarStore';

interface Props {
  onOpenSettings?: () => void;
  onSubmitted: () => void;
  onToast: (message: string) => void;
}

export function AvatarCreateStage({ onOpenSettings, onSubmitted, onToast }: Props) {
  const {
    characters, selectedCharacterId, setSelectedCharacterId,
    voices, selectedVoiceId, setSelectedVoiceId,
    selectedVoiceModel, setSelectedVoiceModel,
    selectedVideoModel, setSelectedVideoModel,
    driveMode, setDriveMode,
    title, setTitle, scriptContent, setScriptContent,
    layout, setLayout, voiceSpeed, setVoiceSpeed, subtitleEnabled, setSubtitleEnabled,
    isSubmitting, submitRender, tasks,
  } = useAvatarStore();
  const [importMode, setImportMode] = useState<'type' | 'file'>('type');
  useAvatarTaskPolling();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleCharacters = characters.filter((item) => {
    const kind = avatarMediaKind(item.videoUrl || item.coverUrl || '');
    return driveMode === 'photo' ? kind === 'image' || !item.videoUrl : kind === 'video';
  });
  const shown = visibleCharacters.length > 0 ? visibleCharacters : characters;
  const estimatedSeconds = Math.max(3, Math.round(scriptContent.length * 0.28 / Math.max(voiceSpeed, 0.5)));
  const activeTasks = tasks.filter((task) => task.status === 0).slice(0, 3);

  const handleStart = async () => {
    if (!scriptContent.trim()) {
      onToast('请输入口播台词');
      return;
    }
    const driverId = resolveModalityModelRoute('avatar', selectedVideoModel).modelId || selectedVideoModel;
    if (!driverId || !isAvatarDriverModel(driverId)) {
      onToast('请先在设置中添加对口型驱动模型');
      return;
    }
    const task = await submitRender();
    if (task) {
      onToast('数字人任务已提交');
      onSubmitted();
    } else {
      onToast('提交失败，请检查形象、音色和对口型模型');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6 pb-8 pt-16">
      <StudioHero
        title="一键生成数字人口播"
        subtitle="选择照片或对口型视频，写好台词并指定配音与驱动模型。系统会按模型家族分别调用语音合成和对口型接口。"
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(['photo', 'video'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDriveMode(mode)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${driveMode === mode ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white/80 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}
          >
            {mode === 'photo' ? '照片数字人' : '视频对口型'}
          </button>
        ))}
      </div>
      {shown.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedCharacterId(item.id)}
              className={`w-24 shrink-0 overflow-hidden rounded-2xl border text-left ${item.id === selectedCharacterId ? 'border-indigo-500' : 'border-slate-200 dark:border-white/10'}`}
            >
              <div className="h-16 bg-slate-100 dark:bg-white/5">
                {item.coverUrl && <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="truncate px-2 py-1 text-[11px] font-semibold">{item.name}</div>
            </button>
          ))}
        </div>
      )}
      {activeTasks.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {activeTasks.map((task) => (
            <article key={task.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-xs dark:border-white/10 dark:bg-[#1B1B1E]/80">
              <div className="font-bold">{task.title}</div>
              <div className="mt-1 text-slate-400">{task.currentStage || '排队中'} · {task.progress}%</div>
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {SCRIPT_TEMPLATES.map((item) => (
          <button key={item.label} type="button" onClick={() => setScriptContent(item.text)} className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 dark:border-white/10 dark:bg-[#1B1B1E]">
            {item.label}
          </button>
        ))}
        <button type="button" onClick={() => setImportMode(importMode === 'file' ? 'type' : 'file')} className="rounded-full border border-dashed border-slate-300 px-3 py-1">
          {importMode === 'file' ? '返回输入' : '导入脚本'}
        </button>
      </div>
      {importMode === 'file' ? (
        <button type="button" onClick={() => fileInputRef.current?.click()} className="mx-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm dark:bg-[#1B1B1E]">
          <UploadCloud className="h-4 w-4" /> 上传 txt / md
          <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              setScriptContent(String(reader.result || '').slice(0, 1500));
              setImportMode('type');
            };
            reader.readAsText(file);
          }} />
        </button>
      ) : (
        <StudioComposer
          title={title}
          onTitleChange={setTitle}
          value={scriptContent}
          onChange={setScriptContent}
          onSubmit={() => { void handleStart(); }}
          submitting={isSubmitting}
          disabled={!scriptContent.trim()}
          placeholder="输入数字人口播台词"
          meta={<span className="shrink-0 font-mono text-[11px] text-slate-400">{scriptContent.length} 字 / ~{estimatedSeconds}s</span>}
          toolbar={
            <>
              <StudioModelCapsule modality="voice" label="配音" value={selectedVoiceModel} onChange={setSelectedVoiceModel} onOpenSettings={onOpenSettings} />
              <StudioModelCapsule modality="avatar" label="驱动" value={selectedVideoModel} onChange={setSelectedVideoModel} onOpenSettings={onOpenSettings} emptyHint="去设置添加对口型模型" />
            </>
          }
          footer={
            <>
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <select value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)} className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/10">
                {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}{voice.status === 0 ? ' · 克隆中' : ''}</option>)}
              </select>
              <button type="button" onClick={() => setLayout(layout === 2 ? 1 : 2)} className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-white/10">{layout === 2 ? '9:16' : '16:9'}</button>
              {[0.9, 1, 1.2].map((speed) => (
                <button key={speed} type="button" onClick={() => setVoiceSpeed(speed)} className={`rounded-full px-2 py-1 text-xs ${voiceSpeed === speed ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/10'}`}>{speed}x</button>
              ))}
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={subtitleEnabled} onChange={(event) => setSubtitleEnabled(event.target.checked)} />
                字幕
              </label>
            </>
          }
        />
      )}
    </div>
  );
}
