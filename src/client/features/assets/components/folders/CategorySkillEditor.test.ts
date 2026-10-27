import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategorySkillVersion } from '@shared/contracts/categorySkills';
import { CategorySkillEditor } from './CategorySkillEditor';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    return [index in hooks.values ? hooks.values[index] : initial, vi.fn()];
  },
}));
const version: CategorySkillVersion = { id: 'source', folderId: 'phone', parentVersionId: '', sourceFingerprint: 'refs', promptSnippet: '原始技能', summary: '', model: 'vision', createdAt: '', manifest: { samples: [], feedbackFingerprint: '', ruleEvidence: [], memoryFingerprint: '', engineVersion: '' } };
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function render(busy = false, success = true) {
  const onRun = vi.fn().mockResolvedValue(success);
  const onClose = vi.fn();
  const view = CategorySkillEditor({ version, busy, onRun, onClose });
  const submit = () => (view.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: vi.fn() });
  return { view, onRun, onClose, submit };
}
beforeEach(() => { hooks.index = 0; hooks.values = []; });
afterEach(() => vi.unstubAllGlobals());

describe('category skill manual editing', () => {
  it('saves exact edited text as a new candidate and closes only after success', async () => {
    hooks.values = ['新技能\n保留换行', '自然侧光'];
    const { view, onRun, onClose, submit } = render();
    expect(view.props['data-skill-dirty']).toBe('true');
    await submit();
    expect(onRun).toHaveBeenCalledExactlyOnceWith('edit', { versionId: 'source', promptSnippet: '新技能\n保留换行', summary: '自然侧光' });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('preserves the draft when saving fails', async () => {
    hooks.values = ['新技能', ''];
    const { onClose, submit } = render(false, false);
    await submit();
    expect(onClose).not.toHaveBeenCalled();
  });
  it.each(['', '  ', '原始技能', ' 原始技能 '])('does not submit blank or unchanged content: %s', async content => {
    hooks.values = [content, '说明'];
    const { onRun, submit } = render();
    await submit();
    expect(onRun).not.toHaveBeenCalled();
  });
  it('prevents duplicate saving while busy', async () => {
    hooks.values = ['新技能', ''];
    const { view, onRun, submit } = render(true);
    expect(nodes(view).filter(node => node.type === 'button').every(node => node.props.disabled)).toBe(true);
    await submit();
    expect(onRun).not.toHaveBeenCalled();
  });
  it('keeps unsaved edits when discard confirmation is declined', () => {
    hooks.values = ['新技能', ''];
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('window', { confirm });
    const { view, onClose } = render();
    const cancel = nodes(view).find(node => node.type === 'button' && node.props.type === 'button')!;
    (cancel.props.onClick as () => void)();
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
