import { expect, it } from 'vitest';
import { xhsSourceKey } from '../xhsSource';
it('identifies one note across official paths and share signatures', () => {
  const id = '65eef3c6653c13fcc5138450';
  const key = xhsSourceKey(`https://www.xiaohongshu.com/explore/${id}?xsec_token=first`);
  expect(key).toBe(`xhs:${id}`);
  expect(xhsSourceKey(`https://www.xiaohongshu.com/discovery/item/${id}?xsec_token=second`)).toBe(key);
  expect(xhsSourceKey(`https://xiaohongshu.com.evil.test/explore/${id}`)).toBeNull();
  expect(xhsSourceKey('https://xhslink.com/a/test')).toBeNull();
});
