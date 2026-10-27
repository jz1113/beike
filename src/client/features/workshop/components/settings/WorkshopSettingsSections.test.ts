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
    expect(render(WorkshopContentSettings)).not.toContain('aria-label="电商图文技能"');
    const manual = render(WorkshopContentSettings, { recipes: [...defaults.recipes, { id: 'custom', name: '手动技能' }] });
    expect(manual).toContain('aria-label="电商图文技能"');
    expect(manual).toContain('手动技能');
  });

  it('uses skill status without reference inventory or replacement controls, even for old batches', () => {
    const automatic = render(WorkshopContentSettings);
    expect(automatic).toContain('根据商品图与创作技能设计分镜');
    expect(automatic).toContain('基础创作技能');
    expect(automatic).not.toContain('高级素材设置');
    expect(automatic).not.toContain('组完整参考图');
    const restored = render(WorkshopContentSettings, Object.assign({}, defaults, { lockedFullPromptId: 'removed-group', personaMode: 'none', assetLoadState: 'error' }));
    expect(restored).toBe(automatic);
  });

  it('shows skill loading errors and keeps invalid saved skills selectable for correction', () => {
    const html = render(WorkshopContentSettings, { skillLoadState: 'error', skillLoadError: '网络异常' });
    expect(html).toContain('技能加载失败：网络异常');
    expect(html).toContain('刷新技能');
    const missing = render(WorkshopContentSettings, { selectedArchId: 'removed' });
    expect(missing).toContain('所选技能已失效');
    expect(missing).toContain('按商品细分应用创作技能');
  });

  it('shows four/eight shot choices only in single-shot mode and grid crop settings only in grid mode', () => {
    const single = render(WorkshopOutputSettings);
    expect(single).toContain('value="8"');
    expect(single).not.toContain('切图交付尺寸');
    const grid = render(WorkshopOutputSettings, { generationStrategy: 'grid_first' });
    expect(grid).toContain('固定 4 镜');
    expect(grid).not.toContain('aria-label="分镜数量"');
    expect(grid).toContain('切图交付尺寸');
    expect(grid).toContain('每张 1240 × 1656 px');
    expect(grid).toContain('aria-label="四宫格拆图" aria-pressed="true"');
  });

  it('uses normalized pixel labels and hides ineffective quality choices on fixed-tier models', () => {
    const single = render(WorkshopOutputSettings);
    expect(single).toContain('2480 × 3312');
    expect(single).not.toContain('4K');
    expect(single).toContain('aria-pressed="true"');
    const fixed = render(WorkshopOutputSettings, { selectedImageGenModel: 'gpt-image-2-2k' });
    expect(fixed).toContain('固定档位');
    expect(fixed.match(/aria-pressed=/g)).toHaveLength(2); // Only generation modes remain selectable.
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
