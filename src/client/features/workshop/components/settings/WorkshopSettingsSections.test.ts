import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkshopContentSettings, WorkshopExecutionSettings, WorkshopOutputSettings } from './WorkshopSettingsSections';
import type { WorkshopSettingsModalProps } from './workshopSettingsTypes';

vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({ ConfiguredModelPicker: () => null }));

const defaults: WorkshopSettingsModalProps = {
  isOpen: true, onClose: vi.fn(),
  selectedArchId: 'auto', setSelectedArchId: vi.fn(),
  recipes: [{ id: '__category_skill__', name: '类目技能' }],
  selectedShotCount: 4, setSelectedShotCount: vi.fn(),
  selectedAspect: '3:4', setSelectedAspect: vi.fn(), setGridOutputSize: vi.fn(),
  selectedQuality: 'high', setSelectedQuality: vi.fn(),
  selectedVisionModel: 'vision', setSelectedVisionModel: vi.fn(), availableVisionModels: [],
  selectedImageGenModel: 'gpt-image-2', setSelectedImageGenModel: vi.fn(), availableImageModels: [],
  generationStrategy: 'single_shot', setGenerationStrategy: vi.fn(),
  autoGenerateCopywriting: false, setAutoGenerateCopywriting: vi.fn(),
  analyzeConcurrency: 6, imageGenConcurrency: 3,
};
const render = (component: typeof WorkshopOutputSettings, overrides: Partial<WorkshopSettingsModalProps> = {}) =>
  renderToStaticMarkup(createElement(component, { ...defaults, ...overrides }));

describe('workshop production settings', () => {
  it('replaces the one-option skill selector with an automatic status while keeping manual recipes selectable', () => {
    expect(render(WorkshopContentSettings)).not.toContain('aria-label="工坊技能"');
    const manual = render(WorkshopContentSettings, { recipes: [...defaults.recipes, { id: 'custom', name: '手动技能' }] });
    expect(manual).toContain('aria-label="工坊技能"');
    expect(manual).toContain('手动技能');
  });

  it('exposes a way to release a restored no-person restriction', () => {
    const html = render(WorkshopContentSettings, { personaMode: 'none', setPersonaMode: vi.fn() });
    expect(html).toContain('此历史批次启用了无人像限制');
    expect(html).toContain('改为跟随图组出镜范围');
    expect(render(WorkshopContentSettings)).not.toContain('无人像限制');
  });

  it('shows four/eight shot choices only in single-shot mode and grid crop settings only in grid mode', () => {
    const single = render(WorkshopOutputSettings);
    expect(single).toContain('value="8"');
    expect(single).not.toContain('切图交付尺寸');
    const grid = render(WorkshopOutputSettings, { generationStrategy: 'grid_first' });
    expect(grid).toContain('固定 4 镜');
    expect(grid).not.toContain('aria-label="分镜数量"');
    expect(grid).toContain('切图交付尺寸');
  });

  it('uses normalized pixel labels and hides ineffective quality choices on fixed-tier models', () => {
    const single = render(WorkshopOutputSettings);
    expect(single).toContain('2480 × 3312');
    expect(single).not.toContain('4K');
    expect(single).toContain('aria-pressed="true"');
    const fixed = render(WorkshopOutputSettings, { selectedImageGenModel: 'gpt-image-2-2k' });
    expect(fixed).toContain('固定档位');
    expect(fixed).not.toContain('aria-pressed');
  });

  it('renders restored concurrency values without blank selects and keeps advanced controls collapsed', () => {
    const html = render(WorkshopExecutionSettings);
    expect(html).toContain('<details>');
    expect(html).not.toContain('<details open');
    expect(html).toContain('value="6" selected=""');
    expect(html).toContain('value="3" selected=""');
    expect(html).toContain('此设置在本机共用');
  });
});
