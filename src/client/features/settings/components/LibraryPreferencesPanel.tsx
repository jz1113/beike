import { useLibraryPreferences, useUpdateLibraryPreferences } from '@client/shared/api/libraryPreferences';
import { SettingsToggle } from './SettingsControls';

const controls = [
  { key: 'showEntry', label: '在首页侧栏显示资产库', hint: '隐藏后，可随时在这里恢复入口。' },
  { key: 'sharingEnabled', label: '参与跨工作区共享', hint: '允许其他参与共享的工作区加入本工作区的素材和已确认脚本，也可以使用它们的素材。关闭后停止新的共享，已加入的副本仍可使用。' },
] as const;

export function LibraryPreferencesPanel() {
  const prefs = useLibraryPreferences();
  const update = useUpdateLibraryPreferences();
  return <section className="max-w-2xl" aria-label="工作区资产库设置">
    <p className="mb-4 text-sm text-slate-500">这些设置只对当前工作区生效。</p>
    {prefs.isPending && <p role="status">正在读取设置…</p>}
    {prefs.error && <p role="alert">{prefs.error.message} <button onClick={() => void prefs.refetch()}>重试</button></p>}
    {prefs.data && controls.map(({ key, label, hint }) => <div key={key} className="flex items-center justify-between gap-4 border-b border-slate-200 py-4 dark:border-white/10">
      <div><h2 className="text-sm font-semibold">{label}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</p></div>
      <SettingsToggle label={label} checked={prefs.data[key]} disabled={update.isPending || prefs.isError}
        onChange={(value) => update.mutate({ [key]: value })} />
    </div>)}
    {update.error && <p role="alert" className="mt-3 text-sm text-rose-600">{update.error.message}</p>}
    {(update.isPending || update.isSuccess) && <p role="status" className="mt-3 text-xs text-slate-500">{update.isPending ? '正在保存…' : '工作区设置已保存'}</p>}
  </section>;
}
