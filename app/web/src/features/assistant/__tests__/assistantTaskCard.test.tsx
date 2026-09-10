import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AssistantTaskCard from '../components/AssistantTaskCard';
vi.mock('@/lib/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
afterEach(cleanup);
it('任务卡明确区分抽样引用与全量审阅，不声称未看的图片已完成', () => {
  render(<AssistantTaskCard task={{ mode: 'plan', goal: '制作6页图文方案', deliverable: 'storyboard', referenceScope: 'sample', totalReferences: 44, references: [{ number: 41, label: '素材41', url: 'https://example.com/41.jpg' }], status: 'completed', stage: '本轮已完成' }} />);
  expect(screen.queryByText(/本轮引用/)).toBeNull();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('先规划')).toBeTruthy();
  expect(screen.getByText(/本轮引用 1 \/ 44 张/).textContent).toContain('不代表已看完图集');
  expect(screen.getByTitle('素材41 · @图片41').getAttribute('href')).toBe('https://example.com/41.jpg');
});
