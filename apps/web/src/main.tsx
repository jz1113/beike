import { configureDomainRuntime } from '@beike/domain/runtime';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProviders } from '@/app/providers';
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary';
import DesktopTokenSync from '@/shared/ui/DesktopTokenSync';
import { installDevConsoleBridge } from '@/lib/devConsoleBridge';
import './styles/globals.css';
import { applyViewportDensity, getViewportDensity } from '@/lib/useMediaQuery';

// 拦截旧 Chunk 404/失效错误并无缝自动重载
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastReload = sessionStorage.getItem('last_preload_reload');
    const now = Date.now();
    if (!lastReload || now - Number(lastReload) > 5000) {
      sessionStorage.setItem('last_preload_reload', String(now));
      window.location.reload();
    }
  });
}

applyViewportDensity(getViewportDensity());

configureDomainRuntime({
  storage: window.localStorage,
  fetch: window.fetch.bind(window),
});

installDevConsoleBridge();

const appTree = (
  <AppErrorBoundary>
    <DesktopTokenSync>
      <AppProviders>
        <App />
      </AppProviders>
    </DesktopTokenSync>
  </AppErrorBoundary>
);

createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV ? <StrictMode>{appTree}</StrictMode> : appTree,
);
