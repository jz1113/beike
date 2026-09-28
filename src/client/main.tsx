import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { AppProviders } from '@client/app/providers';
import AppErrorBoundary from '@client/shared/ui/AppErrorBoundary';
import './styles/globals.css';
import { applyViewportDensity, getViewportDensity } from '@client/shared/hooks/useMediaQuery';

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
  emitEvent: (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail })),
});

const appTree = (
  <AppErrorBoundary>
    <AppProviders>
      <App />
    </AppProviders>
  </AppErrorBoundary>
);

createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV ? <StrictMode>{appTree}</StrictMode> : appTree,
);
