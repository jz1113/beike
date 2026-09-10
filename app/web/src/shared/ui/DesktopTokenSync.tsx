import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setClientAccessToken, setMediaSession } from '@/lib/apiClient';
import {
  DesktopBootstrapContext,
  DESKTOP_API_READY_EVENT,
  type DesktopBootstrapStatus,
} from '@/lib/desktopBootstrap';
import { isTauriDesktop, setApiBase } from '@/lib/desktopRuntime';
import { invokeTauriApi } from '@/lib/tauriApi';
import { invoke } from '@tauri-apps/api/core';
import DesktopBootstrapShell from '@/shared/ui/DesktopBootstrapShell';

const MAX_ATTEMPTS = 24;
const BACKOFF_MS = [200, 400, 600, 800, 1000, 1500, 2000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 桌面端：非阻塞渲染 + 后台重试 token；Web 端保持轻量 health 探测 */
export default function DesktopTokenSync({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DesktopBootstrapStatus>(
    isTauriDesktop() ? 'connecting' : 'ready',
  );
  const [message, setMessage] = useState(
    isTauriDesktop() ? '正在启动本地服务…' : '',
  );
  const [retryTick, setRetryTick] = useState(0);
  const runIdRef = useRef(0);

  const bootstrapDesktop = useCallback(async (runId: number) => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (runIdRef.current !== runId) return;

      try {
        const base = await invoke<string>('get_api_base');
        if (base) setApiBase(base);
      } catch {
        /* sidecar 尚未就绪 */
      }

      try {
        const res = await invokeTauriApi('/api/health');
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          const token = typeof data?.desktopToken === 'string' ? data.desktopToken.trim() : '';
          if (token) setClientAccessToken(token);
          setMediaSession(data?.mediaSession);
          if (runIdRef.current === runId) {
            setStatus('ready');
            setMessage('');
          }
          return;
        }
      } catch {
        /* retry */
      }

      if (runIdRef.current === runId) {
        setMessage(`正在连接本地服务… (${i + 1}/${MAX_ATTEMPTS})`);
      }
      await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)]);
    }

    if (runIdRef.current === runId) {
      setStatus('error');
      setMessage('本地服务启动超时，请确认端口未被占用后重试。');
    }
  }, []);

  const retry = useCallback(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setStatus('connecting');
    setMessage('正在重新连接本地服务…');
    setRetryTick((t) => t + 1);
    void bootstrapDesktop(runId);
  }, [bootstrapDesktop]);

  useEffect(() => {
    const signal = { cancelled: false };

    async function bootstrapWeb() {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const token = typeof data?.desktopToken === 'string' ? data.desktopToken.trim() : '';
        if (token) setClientAccessToken(token);
          setMediaSession(data?.mediaSession);
      } catch {
        /* ignore */
      } finally {
        if (!signal.cancelled) setStatus('ready');
      }
    }

    const refreshMedia = setInterval(() => {
      if (isTauriDesktop()) void invokeTauriApi('/api/health').then(async res => {
        if (res?.ok) setMediaSession((await res.json()).mediaSession);
      }).catch(() => {});
    }, 30 * 60 * 1000);
    if (isTauriDesktop()) {
      runIdRef.current += 1;
      const runId = runIdRef.current;

      const onReady = () => {
        if (!signal.cancelled) void bootstrapDesktop(runId);
      };
      window.addEventListener(DESKTOP_API_READY_EVENT, onReady);
      void bootstrapDesktop(runId);
      return () => {
        clearInterval(refreshMedia);
        signal.cancelled = true;
        runIdRef.current += 1;
        window.removeEventListener(DESKTOP_API_READY_EVENT, onReady);
      };
    }

    void bootstrapWeb();
    return () => {
      clearInterval(refreshMedia);
      signal.cancelled = true;
    };
  }, [bootstrapDesktop, retryTick]);

  const ctx = useMemo(
    () => ({ status, message, retry }),
    [status, message, retry],
  );

  return (
    <DesktopBootstrapContext.Provider value={ctx}>
      <DesktopBootstrapShell>{children}</DesktopBootstrapShell>
    </DesktopBootstrapContext.Provider>
  );
}
