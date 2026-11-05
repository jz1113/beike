import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('home canvas entry points', () => {
  it('keeps the retired composer disconnected from both home and app', () => {
    expect(source('../../../src/client/features/home/HomePage.tsx')).not.toContain('canvasComposer');
    expect(source('../../../src/client/app/App.tsx')).not.toContain('CanvasHomeComposer');
  });
  it('keeps creative tools without the retired recommendation carousel', () => {
    const tools = source('../../../src/client/features/canvas/components/projects/CanvasCreativeTools.tsx');
    expect(tools).not.toContain('CanvasToolSpotlight');
    expect(tools).toContain('data-creative-tool');
  });
});
