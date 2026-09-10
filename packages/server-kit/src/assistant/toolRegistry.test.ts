import { describe, expect, it } from 'vitest';
import { parseToolAction, summarizeToolResult } from './toolRegistry';

describe('assistant toolRegistry', () => {
  it('summarizeToolResult handles navigate action', () => {
    const raw = JSON.stringify({ success: true, action: 'navigate', target_view: 'workshop' });
    expect(summarizeToolResult(raw)).toContain('workshop');
  });

  it('parseToolAction extracts structured action payload', () => {
    const raw = JSON.stringify({
      success: true,
      action: 'load_workshop_product',
      itemId: '12345',
      title: '测试商品',
    });
    const action = parseToolAction(raw);
    expect(action?.action).toBe('load_workshop_product');
    expect(action?.itemId).toBe('12345');
  });
});
