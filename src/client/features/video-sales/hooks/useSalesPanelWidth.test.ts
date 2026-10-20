import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampSalesPanelWidth, readSalesPanelWidth, useSalesPanelWidth } from './useSalesPanelWidth';

const harness = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = index === 1 ? 1280 : typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));

afterEach(() => vi.unstubAllGlobals());

function PanelHarness() { harness.cursor = 0; return useSalesPanelWidth(); }

beforeEach(() => {
  harness.values = [];
  vi.stubGlobal('window', { localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() } });
});

describe('sales panel width', () => {
  it('defaults to 480 pixels and restores stored width', () => {
    expect(readSalesPanelWidth()).toBe(480);
    expect(readSalesPanelWidth({ getItem: () => '530' })).toBe(530);
    expect(PanelHarness().width).toBe(480);
  });
  it('clamps invalid values and keeps room for the workspace', () => {
    expect(clampSalesPanelWidth(100)).toBe(360);
    expect(clampSalesPanelWidth(999)).toBe(640);
    expect(clampSalesPanelWidth(640, 1080)).toBe(472);
    expect(clampSalesPanelWidth(Number.NaN)).toBe(480);
    expect(readSalesPanelWidth({ getItem: () => 'invalid' })).toBe(480);
  });
  it('handles blocked browser storage without losing the default', () => {
    expect(readSalesPanelWidth({ getItem: () => { throw new Error('blocked'); } })).toBe(480);
  });
  it('supports keyboard resizing, accelerated steps and boundary keys', () => {
    const key = (key: string, shiftKey = false) => {
      const preventDefault = vi.fn();
      PanelHarness().separatorProps.onKeyDown({ key, shiftKey, preventDefault } as unknown as Parameters<ReturnType<typeof PanelHarness>['separatorProps']['onKeyDown']>[0]);
      return preventDefault;
    };
    expect(key('ArrowRight')).toHaveBeenCalled();
    expect(PanelHarness().width).toBe(490);
    key('ArrowLeft', true);
    expect(PanelHarness().width).toBe(450);
    key('End');
    expect(PanelHarness().width).toBe(640);
    key('Home');
    expect(PanelHarness().width).toBe(360);
    expect(key('Tab')).not.toHaveBeenCalled();
    expect(window.localStorage.setItem).toHaveBeenLastCalledWith('beike.video_sales.panel-width.v1', '360');
  });
  it('supports pointer dragging and stops when released', () => {
    const current = PanelHarness();
    const focus = vi.fn();
    const setPointerCapture = vi.fn();
    current.separatorProps.onPointerDown({ button: 0, clientX: 100, pointerId: 1, preventDefault: vi.fn(), currentTarget: { focus, setPointerCapture } } as unknown as Parameters<typeof current.separatorProps.onPointerDown>[0]);
    current.separatorProps.onPointerMove({ clientX: 180 } as unknown as Parameters<typeof current.separatorProps.onPointerMove>[0]);
    expect(PanelHarness().width).toBe(560);
    expect(focus).toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    current.separatorProps.onPointerUp();
    current.separatorProps.onPointerMove({ clientX: 250 } as unknown as Parameters<typeof current.separatorProps.onPointerMove>[0]);
    expect(PanelHarness().width).toBe(560);
  });
  it('switches to a single partition below the available-width threshold', () => {
    PanelHarness();
    harness.values[1] = 1000;
    expect(PanelHarness().wide).toBe(false);
    harness.values[1] = 1080;
    expect(PanelHarness().wide).toBe(true);
  });
  it('exposes accessible separator bounds and tolerates write failures', () => {
    vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error('blocked'); });
    const current = PanelHarness();
    expect(current.separatorProps).toMatchObject({ role: 'separator', 'aria-orientation': 'vertical', 'aria-valuemin': 360, 'aria-valuemax': 640, 'aria-valuenow': 480 });
    expect(() => current.separatorProps.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() } as unknown as Parameters<typeof current.separatorProps.onKeyDown>[0])).not.toThrow();
  });
});
