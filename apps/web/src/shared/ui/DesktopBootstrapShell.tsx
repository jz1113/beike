import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useDesktopBootstrap } from '@/shared/desktop/desktopBootstrap';
import { isTauriDesktop } from '@/shared/desktop/desktopRuntime';

export default function DesktopBootstrapShell({ children }: { children: ReactNode }) {
  const { status, message, retry } = useDesktopBootstrap();

  if (!isTauriDesktop() || status === 'ready') {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#F8F9FC]/92 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-busy={status === 'connecting'}
      >
        <div className="flex flex-col items-center gap-4 px-8 py-10 rounded-3xl bg-white shadow-xl border border-slate-100 max-w-sm w-[min(100%,20rem)]">
          {status === 'error' ? (
            <>
              <p className="text-sm text-slate-600 text-center leading-relaxed">{message}</p>
              <button
                type="button"
                onClick={retry}
                className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                重试连接
              </button>
            </>
          ) : (
            <>
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" aria-hidden />
              <p className="text-sm font-medium text-slate-700 text-center">
                {message || '正在启动本地服务…'}
              </p>
              <p className="text-xs text-slate-400 text-center">首次启动可能需要几秒钟</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
