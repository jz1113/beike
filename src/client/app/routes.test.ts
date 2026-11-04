import { describe, expect, it } from 'vitest';
import { isAppView, normalizeAppView } from '@client/store/appView';
import { buildViewSearchParams, parseViewFromSearchParams } from './routes';

describe('retired studio views', () => {
  it.each(['ppt_generator', 'avatar', 'digital_human'])('returns %s links and saved views to home', (view) => {
    expect(normalizeAppView(view)).toBe('home');
    expect(parseViewFromSearchParams(`?view=${view}`)).toBe('home');
    expect(isAppView(view)).toBe(false);
  });
});

describe('history and library navigation', () => {
  it.each(['assets', 'asset_library', 'video_sales'] as const)('round trips the %s view independently', (view) => {
    expect(parseViewFromSearchParams(buildViewSearchParams(view))).toBe(view);
    expect(isAppView(view)).toBe(true);
  });
});
