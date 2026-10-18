import { describe, expect, it } from 'vitest';
import type { ModalityModelItem } from './modalityModelTypes';
import { planModalityChannelSync } from './modalityModelStorage';

function model(partial: Partial<ModalityModelItem> & Pick<ModalityModelItem, 'id' | 'modelId'>): ModalityModelItem {
  return {
    name: partial.modelId,
    modality: 'image',
    vendor: 'flux',
    ...partial,
  };
}

describe('planModalityChannelSync', () => {
  const builtin = model({ id: 'img_openai', name: 'GPT Image', vendor: 'openai', modelId: 'gpt-image-2', isDefault: true });
  const fromGlobal = model({ id: 'image_sync_global', modelId: 'flux-pro', isCustom: true });

  it('keeps the same model id on two channels and labels the later one', () => {
    const planned = planModalityChannelSync(
      [builtin, fromGlobal],
      'image',
      'comfly_gateway',
      ['flux-pro'],
      [{ modelId: 'flux-pro', vendor: 'flux' }],
      'Comfly',
    );

    expect(planned.added).toBe(1);
    expect(planned.removed).toBe(0);
    const copies = planned.models.filter((item) => item.modelId === 'flux-pro');
    expect(copies).toHaveLength(2);
    expect(copies.find((item) => item.channelId === 'comfly_gateway')?.name).toBe('flux-pro · Comfly');
    expect(copies.find((item) => !item.channelId)?.id).toBe('image_sync_global');
  });

  it('removes only the current channel when a synced model is unchecked', () => {
    const fromComfly = model({
      id: 'image_sync_comfly',
      modelId: 'flux-pro',
      channelId: 'comfly_gateway',
      isCustom: true,
      name: 'flux-pro · Comfly',
    });
    const planned = planModalityChannelSync(
      [builtin, fromGlobal, fromComfly],
      'image',
      'comfly_gateway',
      [],
      [{ modelId: 'flux-pro', vendor: 'flux' }],
      'Comfly',
    );

    expect(planned.removed).toBe(1);
    expect(planned.models.some((item) => item.id === 'image_sync_comfly')).toBe(false);
    expect(planned.models.some((item) => item.id === 'image_sync_global')).toBe(true);
    expect(planned.models.some((item) => item.id === 'img_openai')).toBe(true);
  });

  it('does not import a model that is already on the same channel', () => {
    const fromComfly = model({
      id: 'image_sync_comfly',
      modelId: 'flux-pro',
      channelId: 'comfly_gateway',
      isCustom: true,
    });
    const planned = planModalityChannelSync(
      [builtin, fromComfly],
      'image',
      'comfly_gateway',
      ['flux-pro'],
      [{ modelId: 'flux-pro', vendor: 'flux' }],
      'Comfly',
    );

    expect(planned.added).toBe(0);
    expect(planned.removed).toBe(0);
    expect(planned.models.filter((item) => item.channelId === 'comfly_gateway')).toHaveLength(1);
  });

  it('removes an official seed on the current channel when it is unchecked', () => {
    const planned = planModalityChannelSync(
      [builtin, fromGlobal],
      'image',
      '',
      [],
      [{ modelId: 'gpt-image-2', vendor: 'openai' }],
    );

    expect(planned.removed).toBe(1);
    expect(planned.models.some((item) => item.id === 'img_openai')).toBe(false);
    expect(planned.models.some((item) => item.id === 'image_sync_global')).toBe(true);
  });

  it('keeps the same official seed on another channel', () => {
    const onChannel = model({ id: 'img_openai_channel', modelId: 'gpt-image-2', channelId: 'comfly_gateway' });
    const planned = planModalityChannelSync(
      [builtin, onChannel],
      'image',
      'comfly_gateway',
      [],
      [{ modelId: 'gpt-image-2', vendor: 'openai' }],
    );

    expect(planned.removed).toBe(1);
    expect(planned.models.some((item) => item.id === 'img_openai')).toBe(true);
    expect(planned.models.some((item) => item.id === 'img_openai_channel')).toBe(false);
  });

  it('keeps an official seed that is outside the candidate set', () => {
    const planned = planModalityChannelSync(
      [builtin, fromGlobal],
      'image',
      '',
      [],
      [{ modelId: 'flux-pro', vendor: 'flux' }],
    );

    expect(planned.removed).toBe(1);
    expect(planned.models.some((item) => item.id === 'img_openai')).toBe(true);
    expect(planned.models.some((item) => item.id === 'image_sync_global')).toBe(false);
  });
});
