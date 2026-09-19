import { createContext, useContext } from 'react';

export type DesktopBootstrapStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface DesktopBootstrapState {
  status: DesktopBootstrapStatus;
  message: string;
  retry: () => void;
}

const defaultState: DesktopBootstrapState = {
  status: 'ready',
  message: '',
  retry: () => {},
};

export const DesktopBootstrapContext = createContext<DesktopBootstrapState>(defaultState);

export function useDesktopBootstrap() {
  return useContext(DesktopBootstrapContext);
}

/** Rust 侧 API 健康检查通过后派发（见 apps/desktop/src/lib.rs） */
export const DESKTOP_API_READY_EVENT = 'beike-api-ready';
