import { describe, expect, it } from 'vitest';
import { isAppView, normalizeAppView } from '@client/store/appView';
import { buildViewSearchParams, parseAssetLibraryTab, parseViewFromSearchParams } from './routes';

describe('retired studio views', () => {
  it.each(['ppt_generator', 'avatar', 'digital_human', 'workshop', 'buyer_show', 'headline_poster', 'keyword_review', 'video_sales', 'daihuo'])('returns %s links and saved views to home', (view) => {
    expect(normalizeAppView(view)).toBe('home');
    expect(parseViewFromSearchParams(`?view=${view}`)).toBe('home');
    expect(isAppView(view)).toBe(false);
  });
});

describe('history and library navigation', () => {
  it.each(['assets', 'asset_library'] as const)('round trips the %s view independently', (view) => {
    expect(parseViewFromSearchParams(buildViewSearchParams(view))).toBe(view);
    expect(isAppView(view)).toBe(true);
  });
});

describe('asset library tab links', () => {
  it('restores the canvas tab from a shareable asset page URL', () => {
    const search = buildViewSearchParams('assets', { tab: 'canvas' });
    expect(parseViewFromSearchParams(search)).toBe('assets');
    expect(parseAssetLibraryTab(search)).toBe('canvas');
  });
  it('redirects the earlier library canvas link to the asset workspace', () => {
    expect(parseViewFromSearchParams('?view=asset_library&tab=canvas')).toBe('assets');
  });
  it.each(['', '?view=asset_library', '?view=asset_library&tab=unknown'])('keeps legacy and unknown links in the media library: %s', search => {
    expect(parseAssetLibraryTab(search)).toBe('media');
  });
});
