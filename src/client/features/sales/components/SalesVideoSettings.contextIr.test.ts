import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { SalesVideoSettings } from './SalesVideoSettings';

const captured = vi.hoisted(() => ({ contextIrEnabled: undefined as boolean | undefined, onContextIrEnabled: undefined as ((value: boolean) => void) | undefined }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useState: () => [true, () => {}] }));
vi.mock('react-dom', async (original) => ({ ...await original<typeof import('react-dom')>(), createPortal: (children: unknown) => children }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientBaseUrl: () => 'https://metaso.cn' }));
vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({ ConfiguredModelPicker: () => null }));
vi.mock('@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout', () => ({
  usePromptBarPopoverLayout: () => ({ panelRef: { current: null }, panelStyle: {} }),
}));
vi.mock('@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab', () => ({
  videoParamModeLabel: (mode: string) => mode,
  PromptBarVideoTab: (props: { contextIrEnabled?: boolean; onContextIrEnabled?: (value: boolean) => void }) => {
    captured.contextIrEnabled = props.contextIrEnabled;
    captured.onContextIrEnabled = props.onContextIrEnabled;
    return null;
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe('sales Context IR settings binding', () => {
  it.each([undefined, true, false])('uses the persisted choice %s and saves explicit false from the shared switch', (videoContextIrEnabled) => {
    vi.stubGlobal('document', { body: {} });
    const onPatchPlan = vi.fn();
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
    renderToStaticMarkup(createElement(SalesVideoSettings, {
      plan: { ...emptySalesProductionPlan(), videoModel: 'MiniMax-H3', videoContextIrEnabled }, script,
      videoModels: [], references: [], disabled: false, onPatchPlan,
    }));
    expect(captured.contextIrEnabled).toBe(videoContextIrEnabled ?? true);
    captured.onContextIrEnabled!(false);
    expect(onPatchPlan).toHaveBeenCalledWith({ videoContextIrEnabled: false });
  });
});
