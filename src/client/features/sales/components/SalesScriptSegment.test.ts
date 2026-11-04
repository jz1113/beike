import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesScriptBeat } from '@shared/domain/sales';
import { normalizeScriptTemplate } from '@shared/domain/sales/scriptTemplate';
import { buildScriptStoryboard } from '../model/salesScriptStoryboard';
import { updateBeat } from '../model/salesScriptEditor';
import { SalesScriptSegment } from './SalesScriptSegment';

const script = () => normalizeScriptTemplate({ title: '参考片', durationSec: 8, voiceMode: 'speech', shots: [{ beats: [
  { start: 0, end: 4, action: '展示商品', voice: { mode: 'speech', speaker: '人物', text: '原片开场', linePattern: '介绍款式', uncertain: true }, subtitle: '原片字幕' },
  { start: 4, end: 8, action: '展示细节' },
] }] })!;
type ElementProps = { 'aria-label'?: string; children?: ReactNode; onChange?: (event: { target: { value: string; checked: boolean } }) => void };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

describe('reference speech in storyboard review', () => {
  it('shows recorded text and gives empty fields a clear way to add missing source content', () => {
    const [recorded, empty] = buildScriptStoryboard(script()).flatMap((shot) => shot.segments);
    const render = (segment: typeof recorded) => renderToStaticMarkup(createElement(SalesScriptSegment, {
      segment, leakedTerms: [], onFixLeak: vi.fn(), onChangeBeat: vi.fn(),
    }));
    const html = render(recorded);
    for (const value of ['原片声音与字幕', '原片开场', '介绍款式', '原片字幕', '不会直接作为成片台词', '台词待核对']) expect(html).toContain(value);
    const blank = render(empty);
    expect(blank).toContain('未记录原片台词，可对照视频补录');
    expect(blank).toContain('未记录原片字幕，可对照视频补录');
  });

  it('edits only the requested record on the addressed beat and preserves other voice metadata', () => {
    let current = script();
    const segment = buildScriptStoryboard(current)[0].segments[0];
    const onChangeBeat = vi.fn((patch: Partial<SalesScriptBeat>) => { current = updateBeat(current, segment.address, patch); });
    const tree = SalesScriptSegment({ segment, leakedTerms: [], onFixLeak: vi.fn(), onChangeBeat });
    const fields = elements(tree);
    fields.find((node) => node.props['aria-label'] === '分镜 1 原片台词')!.props.onChange!({ target: { value: '人工补录口播', checked: false } });
    expect(current.shots[0].beats[0].voice).toMatchObject({ text: '人工补录口播', mode: 'speech', speaker: '人物', linePattern: '介绍款式', uncertain: true });
    expect(current.shots[0].beats[1].voice.text).toBe('');
    expect(buildScriptStoryboard(current)[0].segments[0].prompt).toContain('原片台词记录：人工补录口播');
    const nextSegment = buildScriptStoryboard(current)[0].segments[0];
    const nextFields = elements(SalesScriptSegment({ segment: nextSegment, leakedTerms: [], onFixLeak: vi.fn(), onChangeBeat }));
    nextFields.find((node) => node.props['aria-label'] === '分镜 1 话术结构')!.props.onChange!({ target: { value: '讲解细节', checked: false } });
    nextFields.find((node) => node.props['aria-label'] === '分镜 1 原片字幕')!.props.onChange!({ target: { value: '补录字幕', checked: false } });
    expect(current.shots[0].beats[0]).toMatchObject({ voice: { text: '人工补录口播', linePattern: '讲解细节', uncertain: true }, subtitle: '补录字幕' });
  });
});
