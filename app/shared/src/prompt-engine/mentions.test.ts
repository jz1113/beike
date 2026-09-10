import { describe, expect, it } from 'vitest';
import {
  extractCustomMentionNames,
  findUnresolvedMentions,
  inferReferenceMentionNames,
  normalizeReferenceMentions,
  resolveReferenceMentionNames,
} from './mentions';

describe('normalizeReferenceMentions', () => {
  it('maps custom depth_mocap name to @图片1', () => {
    const prompt = '使用 @depth_mocap_178833427 的风格生成人物';
    const out = normalizeReferenceMentions(prompt, ['depth_mocap_178833427']);
    expect(out).toBe('使用 @图片1 的风格生成人物');
  });

  it('maps multiple custom names by reference order', () => {
    const prompt = '融合 @cat 与 @depth_mocap_1 的风格';
    const out = normalizeReferenceMentions(prompt, ['depth_mocap_1', 'cat']);
    expect(out).toBe('融合 @图片2 与 @图片1 的风格');
  });

  it('preserves existing @图片N slots', () => {
    const prompt = '商品外观以 @图片1 为准';
    const out = normalizeReferenceMentions(prompt, ['product.png']);
    expect(out).toBe('商品外观以 @图片1 为准');
  });
});

describe('inferReferenceMentionNames', () => {
  it('infers single custom mention for one reference image', () => {
    expect(
      inferReferenceMentionNames('参考 @depth_mocap_178833427 生成', 1),
    ).toEqual(['depth_mocap_178833427']);
  });
});

describe('resolveReferenceMentionNames', () => {
  it('prefers explicit names from client', () => {
    expect(
      resolveReferenceMentionNames('参考 @foo', 2, ['depth_a', 'depth_b']),
    ).toEqual(['depth_a', 'depth_b']);
  });
});

describe('findUnresolvedMentions', () => {
  it('flags mentions without matching reference names', () => {
    expect(
      findUnresolvedMentions('使用 @missing_ref 生成', ['depth_mocap_1']),
    ).toEqual(['missing_ref']);
  });

  it('accepts resolved custom names', () => {
    expect(
      findUnresolvedMentions('使用 @depth_mocap_1 生成', ['depth_mocap_1']),
    ).toEqual([]);
  });
});

describe('extractCustomMentionNames', () => {
  it('skips standard @图片N tokens', () => {
    expect(extractCustomMentionNames('以 @图片1 和 @depth_x 为准')).toEqual(['depth_x']);
  });
});
