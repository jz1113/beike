import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { runSeedancePrecheck, useSeedancePrecheck, type SeedancePrecheckEntry } from '@client/shared/api/generation/seedancePrecheck';
import { SalesMaterialComplianceBadge } from './SalesMaterialComplianceBadge';

vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({
  runSeedancePrecheck: vi.fn(), useSeedancePrecheck: vi.fn(),
}));
const item = { url: '/storage/assets/depth.mp4', mediaType: 'depth-video' as const };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useSeedancePrecheck).mockReturnValue(new Map());
});

it('observes existing checks without uploading the library and lets unchecked media be checked explicitly', () => {
  const badge = SalesMaterialComplianceBadge(item)!;
  expect(useSeedancePrecheck).toHaveBeenCalledWith([item], false);
  expect(runSeedancePrecheck).not.toHaveBeenCalled();
  expect(badge.props['aria-label']).toContain('待校验');
  expect(badge.type).toBe('button');
  badge.props.onClick();
  expect(runSeedancePrecheck).toHaveBeenCalledWith([item]);
});

it.each([
  ['passed', '已通过合规校验', 'lucide-shield-check'],
  ['rejected', '合规校验未通过', 'lucide-shield-x'],
  ['verifying', '正在校验', 'animate-spin'],
  ['skipped', '待校验', 'lucide-shield-question'],
] as const)('renders the actual %s result with an accessible status and inspection details', (status, label, icon) => {
  const entry: SeedancePrecheckEntry = {
    url: item.url, mediaType: 'video', status, width: 480, height: 896, durationSec: 13.8,
    ...(status === 'rejected' ? { error: '参考视频未通过安全检测' } : {}),
  };
  vi.mocked(useSeedancePrecheck).mockReturnValue(new Map([[item.url, entry]]));
  const html = renderToStaticMarkup(createElement(SalesMaterialComplianceBadge, item));
  expect(html).toContain(`Seedance：${label}`);
  expect(html).toContain(icon);
  expect(html).toContain('480 × 896');
  expect(html).toContain('13.8 秒');
  if (status === 'rejected') expect(html).toContain(entry.error);
  if (status !== 'passed') expect(html).not.toContain('已通过合规校验');
});
