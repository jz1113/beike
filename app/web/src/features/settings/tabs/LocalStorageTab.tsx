import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, ExternalLink, Save, Activity, PieChart, Trash2, HardDrive, RefreshCw } from 'lucide-react';
import { settingsPanelPad } from '@/shared/ui/layoutClasses';
import { isTauriDesktop } from '@/lib/desktopRuntime';
import {
  formatBytes,
  getCacheDir,
  getDownloadDir,
  isCacheDirEnabled,
  isIdbCacheEnabled,
  isProjectAutosaveEnabled,
  setCacheDir,
  setCacheDirEnabled,
  setIdbCacheEnabled,
  setProjectAutosaveEnabled,
} from '@/lib/localStoragePrefs';
import {
  dispatchMemoryCleanup,
  getAppDataDir,
  getAppMemoryUsage,
  getSystemMemoryBytes,
  openFolderInExplorer,
  pickCacheDir,
  pickDownloadDir,
  resolveDownloadDir,
  type AppMemoryUsage,
} from '@/lib/desktopDownload';
import { clearDerivedCache } from '@/lib/idbMediaCache';
import { apiFetch } from '@/lib/apiClient';
import {
  clearDerivedDiskCache,
  fetchLocalStorageStats,
  persistCacheDirToEnv,
  type LocalStorageStats,
} from '@/lib/storageStatsClient';

export interface LocalStorageTabProps {
  showToast: (msg: string) => void;
}

interface JsMemoryInfo {
  used: number;
  limit: number;
}

function readJsMemory(): JsMemoryInfo | null {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (!perf.memory) return null;
  return {
    used: perf.memory.usedJSHeapSize,
    limit: perf.memory.jsHeapSizeLimit,
  };
}



function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono text-slate-700 text-right">{value}</span>
      </div>
      {hint ? <p className="text-[10px] text-slate-400 leading-snug">{hint}</p> : null}
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4.5 h-4.5 text-slate-600" />
          <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function LocalStorageTab({ showToast }: LocalStorageTabProps) {
  const desktop = isTauriDesktop();
  const [downloadDir, setDownloadDirState] = useState('');
  const [cacheDir, setCacheDirState] = useState('');
  const [cacheEnabled, setCacheEnabledState] = useState(false);
  const [autosave, setAutosave] = useState(true);
  const [idbEnabled, setIdbEnabled] = useState(true);
  const [appDataDir, setAppDataDir] = useState('');
  const [appMemory, setAppMemory] = useState<AppMemoryUsage | null>(null);
  const [systemMemGb, setSystemMemGb] = useState<number | null>(null);
  const [jsMem, setJsMem] = useState<JsMemoryInfo | null>(null);
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refreshStats = useCallback(async (estimateDelayMs = 0) => {
    setLoadingStats(true);
    try {
      const s = await fetchLocalStorageStats({ estimateDelayMs });
      setStats(s);
      return s;
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setDownloadDirState(getDownloadDir());
      setCacheDirState(getCacheDir());
      setCacheEnabledState(isCacheDirEnabled());
      setAutosave(isProjectAutosaveEnabled());
      setIdbEnabled(isIdbCacheEnabled());
      if (desktop) {
        const [dir, dataDir, mem, procMem] = await Promise.all([
          resolveDownloadDir(),
          getAppDataDir(),
          getSystemMemoryBytes(),
          getAppMemoryUsage(),
        ]);
        if (dir) setDownloadDirState(dir);
        setAppDataDir(dataDir);
        setAppMemory(procMem);
        if (mem > 0) setSystemMemGb(mem / (1024 ** 3));
        else if (procMem?.total_system_bytes) {
          setSystemMemGb(procMem.total_system_bytes / (1024 ** 3));
        }
      }
      await refreshStats();
    })();
  }, [desktop, refreshStats]);

  useEffect(() => {
    setJsMem(readJsMemory());
    const timer = setInterval(() => setJsMem(readJsMemory()), 2000);
    return () => clearInterval(timer);
  }, []);

  const defaultCacheDisplay = cacheEnabled && cacheDir
    ? cacheDir
    : appDataDir
      ? `${appDataDir}/storage`
      : '未选择';

  const handlePickDownload = async () => {
    const picked = await pickDownloadDir();
    if (picked) {
      setDownloadDirState(picked);
      showToast('✅ 下载目录已更新');
    }
  };

  const handlePickCache = async () => {
    const picked = await pickCacheDir();
    if (!picked) return;
    setCacheDirState(picked);
    setCacheDir(picked);
    setCacheDirEnabled(true);
    setCacheEnabledState(true);
    const ok = await persistCacheDirToEnv(picked);
    showToast(ok ? '✅ 缓存目录已保存' : '⚠️ 缓存目录已选，但写入 .env 失败');
  };

  const handleClearMemory = async () => {
    dispatchMemoryCleanup();
    const idbCleared = await clearDerivedCache();
    let diskCleared = 0;
    try {
      const res = await clearDerivedDiskCache();
      diskCleared = res.clearedBytes ?? 0;
    } catch {
      /* ignore */
    }

    // 调用服务端全链路内存释放端点（清空 Sharp 堆外缓存、截断 SQLite WAL、执行 V8 GC）
    let serverFreed = 0;
    try {
      const serverRes = await apiFetch('/api/system/memory-cleanup', { method: 'POST' });
      if (serverRes.ok) {
        const json = await serverRes.json();
        serverFreed = json?.freedBytes ?? 0;
      }
    } catch {
      /* ignore */
    }

    await refreshStats(200);
    if (desktop) {
      const procMem = await getAppMemoryUsage();
      setAppMemory(procMem);
    }
    const freed = idbCleared.bytes + diskCleared + serverFreed;
    showToast(
      freed > 0
        ? `✅ 已清理前后端内存与缓存，释放 ${formatBytes(freed)}`
        : '✅ 已深度清理 WebGL / IDB / 服务端缓存与 SQLite WAL',
    );
  };

  const handleClearDerived = async () => {
    setClearing(true);
    try {
      const res = await clearDerivedDiskCache();
      await clearDerivedCache();
      await refreshStats(200);
      const freed = res.clearedBytes ?? 0;
      if (res.ok) {
        showToast(
          freed > 0
            ? `✅ 已清理派生磁盘缓存，释放 ${formatBytes(freed)}`
            : '✅ 派生磁盘缓存已为空，无需清理',
        );
      } else {
        showToast(`⚠️ ${res.message || '清理失败'}`);
      }
    } finally {
      setClearing(false);
    }
  };

  const handleClearIdb = async () => {
    setClearing(true);
    try {
      const cleared = await clearDerivedCache();
      await refreshStats(200);
      showToast(
        cleared.bytes > 0
          ? `✅ 已清除 IDB 缓存，释放 ${formatBytes(cleared.bytes)}（${cleared.count} 条）`
          : '✅ IDB 缓存已为空，无需清理',
      );
    } finally {
      setClearing(false);
    }
  };

  const derivedDiskBytes = stats?.derivedDirBytes ?? 0;
  const idbCacheBytes = stats?.idbBytes ?? 0;
  const totalLocalBytes = stats
    ? stats.dbBytes + stats.storageDirBytes + stats.idbBytes
    : null;

  const jsPct = jsMem && jsMem.limit > 0 ? (jsMem.used / jsMem.limit) * 100 : 0;
  const appRssGb = appMemory?.rss_bytes ? appMemory.rss_bytes / (1024 ** 3) : null;

  return (
    <div className={`${settingsPanelPad} space-y-6 max-w-3xl animate-fade-in`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900">本地存储与缓存</h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            管理图片/视频下载目录、本地磁盘缓存释放与存储占用分析
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStats()}
          disabled={loadingStats}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
          title="刷新统计"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!desktop && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          当前为浏览器开发模式：目录选择与直写磁盘不可用，IDB 与派生缓存统计仍可正常使用。
        </div>
      )}

      {/* 2. 下载目录设置 */}
      <SettingsCard icon={FolderOpen} title="下载目录设置">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 text-xs">
          <span className="text-slate-500 shrink-0">当前下载目录</span>
          <span className="font-mono text-slate-700 truncate text-right">{downloadDir || '未选择'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handlePickDownload()}
            disabled={!desktop}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            选择下载目录
          </button>
          <button
            type="button"
            onClick={() => void openFolderInExplorer(downloadDir)}
            disabled={!desktop || !downloadDir}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            打开文件夹
          </button>
        </div>
      </SettingsCard>

      {/* 3. 资源缓存目录 */}
      <SettingsCard
        icon={HardDrive}
        title="资源缓存目录"
        badge={
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            cacheEnabled && cacheDir
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {cacheEnabled && cacheDir ? '已启用' : '未启用'}
          </span>
        }
      >
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 text-xs">
          <span className="text-slate-500 shrink-0">缓存目录</span>
          <span className="font-mono text-slate-700 truncate text-right">{defaultCacheDisplay}</span>
        </div>
        <button
          type="button"
          onClick={() => void handlePickCache()}
          disabled={!desktop}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          选择缓存目录
        </button>
      </SettingsCard>

      {/* 4. 项目管理自动保存 */}
      <SettingsCard icon={Save} title="项目管理自动保存">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-600">启用后自动保存生图会话与助手对话到本地</span>
          <button
            type="button"
            onClick={() => {
              const next = !autosave;
              setAutosave(next);
              setProjectAutosaveEnabled(next);
              showToast(next ? '✅ 已启用自动保存' : '已关闭自动保存');
            }}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
              autosave ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            aria-pressed={autosave}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                autosave ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/80">
          <span className="text-xs text-slate-600">IndexedDB 派生媒体缓存</span>
          <button
            type="button"
            onClick={() => {
              const next = !idbEnabled;
              setIdbEnabled(next);
              setIdbCacheEnabled(next);
              showToast(next ? '✅ IDB 缓存已启用' : '已关闭 IDB 缓存');
            }}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
              idbEnabled ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            aria-pressed={idbEnabled}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                idbEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </SettingsCard>

      {/* 5. 内存管理 */}
      <SettingsCard icon={Activity} title="内存管理">
        {jsMem ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">JavaScript 堆内存</span>
              <span className="font-mono text-slate-700">
                {formatBytes(jsMem.used)} / {formatBytes(jsMem.limit)} ({jsPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, jsPct)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">当前 WebView 无法读取 JS 堆内存（macOS WKWebView 限制）</p>
            {appRssGb != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">应用进程内存（Tauri RSS）</span>
                <span className="font-mono text-slate-700">{appRssGb.toFixed(2)} GB</span>
              </div>
            )}
          </div>
        )}
        {systemMemGb != null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">系统总内存</span>
            <span className="font-mono text-slate-700">{systemMemGb.toFixed(2)} GB</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleClearMemory()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          一键清理内存（释放 WebGL 与缓存）
        </button>
      </SettingsCard>

      {/* 6. 存储使用情况 */}
      <SettingsCard icon={PieChart} title="存储与缓存使用概况">
        <div className="space-y-2.5 text-xs">
          <StatRow
            label="派生磁盘缓存"
            value={
              stats != null
                ? `${stats.derivedFileCount} 个文件 · ${formatBytes(derivedDiskBytes)}`
                : '—'
            }
            hint="storage/derived 目录中的缩略图与转码文件，可安全清理"
          />
          <StatRow
            label="IDB 媒体缓存"
            value={
              stats != null
                ? `${stats.idbCount} 条 · ${formatBytes(idbCacheBytes)}`
                : '—'
            }
            hint="IndexedDB 中的派生媒体缓存，点击「清除 IDB 缓存」可释放"
          />
          <StatRow
            label="可清理缓存合计"
            value={stats != null ? formatBytes(stats.clearableBytes) : '—'}
            hint="派生磁盘 + IDB 媒体，不含数据库与 localStorage 配置"
          />
          <StatRow
            label="浏览器存储估算"
            value={
              stats?.browserStorageBytes != null
                ? `${formatBytes(stats.browserStorageBytes)}${
                    stats.browserStorageQuota != null
                      ? ` / ${formatBytes(stats.browserStorageQuota)}`
                      : ''
                  }`
                : stats?.statsAvailable
                  ? '0 B'
                  : '无法读取'
            }
            hint={
              stats
                ? `含 localStorage 约 ${formatBytes(stats.localStorageBytes)} 等 Origin 存储（navigator.storage.estimate）`
                : 'localStorage / IndexedDB 等 Origin 存储（navigator.storage.estimate）'
            }
          />
          <StatRow
            label="合计本地占用"
            value={
              stats == null
                ? '—'
                : stats.statsAvailable || (totalLocalBytes ?? 0) > 0
                  ? formatBytes(totalLocalBytes ?? 0)
                  : '无法读取'
            }
            hint="数据库 + storage 目录 + IDB"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
          <button
            type="button"
            onClick={() => void handleClearDerived()}
            disabled={clearing}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清理派生磁盘缓存
          </button>
          <button
            type="button"
            onClick={() => void handleClearIdb()}
            disabled={clearing}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除 IDB 缓存
          </button>
        </div>
      </SettingsCard>

      {appDataDir && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <HardDrive className="w-3.5 h-3.5" />
          <span className="truncate">应用数据目录：{appDataDir}</span>
        </div>
      )}
    </div>
  );
}
