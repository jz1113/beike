import { useEffect, useRef, useState } from 'react';
import { Clapperboard, History, ImagePlus, Mic, Plus, Settings2, Sparkles, UserRound } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { StudioDockBar, studioDockClass } from '@client/shared/ui/studio/StudioDockBar';
import { StudioHistoryDrawer } from '@client/shared/ui/studio/StudioHistoryDrawer';
import type { AvatarVideoTask } from '@shared/contracts';
import AvatarCreationsView from './components/AvatarCreationsView';
import AvatarCharactersView from './components/AvatarCharactersView';
import AvatarVoicesView from './components/AvatarVoicesView';
import { AvatarCreateStage } from './components/AvatarCreateStage';
import { useAvatarStore } from './store/useAvatarStore';

interface Props {
  onBackToHome?: () => void;
  onOpenSettings?: () => void;
}

type AvatarMode = 'create' | 'creations' | 'characters' | 'voices';

export default function AvatarStudioView({ onBackToHome, onOpenSettings }: Props) {
  const { tasks, loadAllAssets, setTitle, setScriptContent, setSelectedCharacterId, setSelectedVoiceId, setLayout, setFontId, setBgType, setBgColor } = useAvatarStore();
  const [mode, setMode] = useState<AvatarMode>('create');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadAllAssets();
  }, [loadAllAssets]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 3000);
  };

  const reuseTask = (task: AvatarVideoTask) => {
    setTitle(`${task.title} (复用)`);
    setScriptContent(task.scriptContent);
    setSelectedCharacterId(task.avatarId);
    setSelectedVoiceId(task.voiceId);
    setLayout(task.layout);
    setFontId(task.fontId);
    setBgType(task.bgType);
    setBgColor(task.bgColor);
    setMode('create');
    setHistoryOpen(false);
  };

  const dock = [
    { id: 'new', icon: <Plus className="h-4 w-4" />, label: '新建', onClick: () => setMode('create'), className: studioDockClass(false) },
    { id: 'create', icon: <Sparkles className="h-4 w-4" />, label: '创作台', onClick: () => setMode('create'), active: mode === 'create', className: studioDockClass(mode === 'create') },
    { id: 'creations', icon: <Clapperboard className="h-4 w-4" />, label: '成片作品', onClick: () => setMode('creations'), active: mode === 'creations', className: studioDockClass(mode === 'creations') },
    { id: 'characters', icon: <UserRound className="h-4 w-4" />, label: '形象资产', onClick: () => setMode('characters'), active: mode === 'characters', className: studioDockClass(mode === 'characters') },
    { id: 'voices', icon: <Mic className="h-4 w-4" />, label: '声音库', onClick: () => setMode('voices'), active: mode === 'voices', className: studioDockClass(mode === 'voices') },
    { id: 'history', icon: <History className="h-4 w-4" />, label: '历史', onClick: () => setHistoryOpen(true), className: studioDockClass(false) },
    { id: 'settings', icon: <Settings2 className="h-4 w-4" />, label: '设置', onClick: () => onOpenSettings?.(), className: studioDockClass(false) },
  ];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent text-slate-900 dark:text-slate-100">
      <StudioBrandChip title="数字人" icon={<ImagePlus className="h-4 w-4" />} onBack={() => onBackToHome?.()} />
      <StudioDockBar items={dock} label="数字人导航" />
      {toastMessage && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-2xl bg-slate-950/90 px-4 py-2 text-xs font-semibold text-white shadow-2xl">{toastMessage}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        {mode === 'creations' && <div className="mx-auto mt-24 max-w-[1120px] rounded-[32px] border border-slate-200/80 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#18181C]/70 sm:p-6"><AvatarCreationsView onReuseTask={reuseTask} /></div>}
        {mode === 'characters' && <div className="mx-auto mt-24 max-w-[1120px] rounded-[32px] border border-slate-200/80 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#18181C]/70 sm:p-6"><AvatarCharactersView /></div>}
        {mode === 'voices' && <div className="mx-auto mt-24 max-w-[1120px] rounded-[32px] border border-slate-200/80 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#18181C]/70 sm:p-6"><AvatarVoicesView /></div>}
        {mode === 'create' && <AvatarCreateStage onOpenSettings={onOpenSettings} onSubmitted={() => setMode('creations')} onToast={showToast} />}
      </div>
      <StudioHistoryDrawer
        open={historyOpen}
        title="成片历史"
        onClose={() => setHistoryOpen(false)}
        items={tasks.map((task) => ({
          id: task.id,
          title: task.title,
          subtitle: task.status === 1 ? '已完成' : task.currentStage || '处理中',
          onOpen: () => reuseTask(task),
        }))}
      />
    </div>
  );
}
