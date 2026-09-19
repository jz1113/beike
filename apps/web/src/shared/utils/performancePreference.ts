/**
 * ⚡ 全局渲染与动效性能偏好管理器
 * - eco: 极速流畅模式（关闭首页常驻 3D 粒子，生图优先极速 CSS，杜绝发热卡顿）
 * - balanced: 均衡模式（默认，适度特效，自动并发与休眠调度）
 * - fidelity: 极致视效模式（全效全开，完整 3D 粒子和 WebGL 着色器）
 */
import { useState, useEffect } from 'react';

export type PerformanceMode = 'eco' | 'balanced' | 'fidelity';

export const PERFORMANCE_MODE_KEY = 'zhuo_performance_mode';

export function getPerformanceMode(): PerformanceMode {
  if (typeof window === 'undefined') return 'balanced';
  try {
    const saved = localStorage.getItem(PERFORMANCE_MODE_KEY);
    if (saved === 'eco' || saved === 'balanced' || saved === 'fidelity') {
      return saved;
    }
  } catch {}
  return 'balanced';
}

export function setPerformanceMode(mode: PerformanceMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERFORMANCE_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent('zhuo_performance_mode_change', { detail: mode }));
  } catch {}
}

export function usePerformanceMode(): [PerformanceMode, (mode: PerformanceMode) => void] {
  const [mode, setModeState] = useState<PerformanceMode>(() => getPerformanceMode());

  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<PerformanceMode>;
      if (customEvent.detail) {
        setModeState(customEvent.detail);
      } else {
        setModeState(getPerformanceMode());
      }
    };

    window.addEventListener('zhuo_performance_mode_change', handleModeChange);
    window.addEventListener('storage', handleModeChange);
    return () => {
      window.removeEventListener('zhuo_performance_mode_change', handleModeChange);
      window.removeEventListener('storage', handleModeChange);
    };
  }, []);

  const updateMode = (newMode: PerformanceMode) => {
    setModeState(newMode);
    setPerformanceMode(newMode);
  };

  return [mode, updateMode];
}
