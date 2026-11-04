import { Children, isValidElement, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import type { useSalesAssetViews } from '../hooks/useSalesAssetViews';
import { PERSONA_VIEWS, type SupplementView } from '../model/salesPersonaViews';
import { SalesAssetViewGallery } from './SalesAssetViewGallery';
import { SalesPersonaSheet } from './SalesPersonaSheet';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';

type Node = ReactElement<Record<string, unknown>>;
type Photos = ReturnType<typeof useSalesAssetViews<SupplementView>>;
function nodes(root: Node): Node[] {
  const result = [root];
  for (let index = 0; index < result.length; index += 1) Children.forEach(result[index].props.children as ReactElement, (child) => {
    if (isValidElement<Record<string, unknown>>(child)) result.push(child);
  });
  return result;
}
function render(imageUrl = '') {
  const uploadReference = vi.fn();
  const photos = {
    views: Object.fromEntries(PERSONA_VIEWS.map(({ id }) => [id, id === 'main' ? imageUrl : ''])),
    extraImages: [], models: [], model: '', stage: '', active: [], missing: ['face'],
    creationMode: true, referenceUrl: '/reference.jpg', creation: { referenceImageUrl: '/reference.jpg', prompt: '自然光下的全新人物形象', imageUrl },
    uploadReference, removeReference: vi.fn(), setModel: vi.fn(), generate: vi.fn(), remove: vi.fn(), upload: vi.fn(),
  } as unknown as Photos;
  return { elements: nodes(SalesAssetViewGallery({ subject: '人物', definitions: PERSONA_VIEWS, photos, busy: false })), uploadReference };
}

it('keeps the reference separate from the generated asset and its copyable prompt', () => {
  const { elements } = render('/generated.jpg');
  expect(elements.filter((node) => node.type === SalesPersonaSheet)).toHaveLength(1);
  expect(elements.some((node) => node.type === 'img')).toBe(false);
  expect(elements.find((node) => node.type === SalesScriptCopyButton)?.props.text).toBe('自然光下的全新人物形象');
  expect(elements.some((node) => node.type === 'input' && node.props['aria-label'] === '上传主图参考图')).toBe(false);
});

it('uploads a new reference without treating it as an asset main image', () => {
  const { elements, uploadReference } = render();
  const input = elements.find((node) => node.type === 'input' && node.props['aria-label'] === '上传人物参考图');
  const file = new File(['reference'], 'reference.jpg', { type: 'image/jpeg' });
  (input?.props.onChange as (event: { target: { files: File[]; value: string } }) => void)({ target: { files: [file], value: 'reference.jpg' } });
  expect(uploadReference).toHaveBeenCalledWith(file);
  expect(elements.some((node) => node.type === 'img' && node.props.alt === '人物主图')).toBe(false);
  expect(elements.some((node) => node.type === 'a' && node.props.download === '人物主图.jpg')).toBe(false);
  expect(elements.filter((node) => node.type === 'input' && node.props.type === 'file')).toHaveLength(1);
  expect(elements.some((node) => node.type === SalesPersonaSheet)).toBe(true);
});

it('offers one reference upload and a single preview after generation', () => {
  const { elements } = render('/generated.jpg');
  expect(elements.filter((node) => node.type === 'input' && node.props.type === 'file')).toHaveLength(1);
});
