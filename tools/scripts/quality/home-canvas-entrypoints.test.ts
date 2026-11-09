import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('home canvas entry points', () => {
  it('keeps the retired composer disconnected from both home and app', () => {
    expect(source('../../../src/client/features/home/HomePage.tsx')).not.toContain('canvasComposer');
    expect(source('../../../src/client/app/App.tsx')).not.toContain('CanvasHomeComposer');
  });
  it('does not render the retired creative tools', () => {
    expect(source('../../../src/client/features/home/HomePage.tsx')).not.toContain('creativeTools');
    expect(source('../../../src/client/app/App.tsx')).not.toContain('CanvasCreativeTools');
  });
});
