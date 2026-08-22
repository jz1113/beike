import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './App';
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary';
import DesktopTokenSync from '@/shared/ui/DesktopTokenSync';
import { installDevConsoleBridge } from '@/lib/devConsoleBridge';
import './styles/globals.css';

installDevConsoleBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <DesktopTokenSync>
        <Home />
      </DesktopTokenSync>
    </AppErrorBoundary>
  </StrictMode>,
);
