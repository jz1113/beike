// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BatchStage2PresetBar } from '../components/BatchStage2PresetBar';
import { WorkshopSettingsModal } from '../../components/WorkshopSettingsModal';

describe('Workshop Preset System & Stage2 Preset Bar', () => {
  const mockRecipes = [
    { id: 'recipe_1', name: '珠宝首饰 8段式装配骨架与物理守卫' },
    { id: 'recipe_2', name: '服装人像 时尚穿搭' },
  ];
  const mockVisionModels = [
    { id: 'gpt-4o', name: 'GPT-4o Vision', shortName: 'gpt-4o' },
  ];
  const mockImageModels = [
    { id: 'flux-pro', name: 'Flux 1.1 Pro', shortName: 'flux-pro' },
  ];

  it('BatchStage2PresetBar renders compact info and triggers settings modal', () => {
    const onOpenSettings = vi.fn();

    render(
      <BatchStage2PresetBar
        recipes={mockRecipes}
        selectedArchId="recipe_1"
        selectedShotCount={3}
        selectedAspect="3:4"
        hasHumanPersona={false}
        selectedVisionModel="gpt-4o"
        availableVisionModels={mockVisionModels}
        selectedImageGenModel="flux-pro"
        availableImageModels={mockImageModels}
        onOpenSettings={onOpenSettings}
        readyCount={3}
        totalCount={5}
      />
    );

    expect(screen.getByText('珠宝首饰 8段式装配骨架与物理守卫')).toBeDefined();
    expect(screen.getByText(/3\s*镜/)).toBeDefined();
    expect(screen.getByText('3:4')).toBeDefined();
    expect(screen.getByText('纯商品实物')).toBeDefined();
    expect(screen.getByText(/已就绪/)).toBeDefined();

    const editBtn = screen.getByText('调整预设');
    fireEvent.click(editBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('WorkshopSettingsModal renders tabs and updates shoot count and aspect ratio', () => {
    const setSelectedShotCount = vi.fn();
    const setSelectedAspect = vi.fn();
    const onClose = vi.fn();

    render(
      <WorkshopSettingsModal
        isOpen={true}
        onClose={onClose}
        selectedArchId="recipe_1"
        setSelectedArchId={vi.fn()}
        recipes={mockRecipes}
        selectedShotCount={1}
        setSelectedShotCount={setSelectedShotCount}
        selectedAspect="3:4"
        setSelectedAspect={setSelectedAspect}
        hasHumanPersona={false}
        setHasHumanPersona={vi.fn()}
        selectedQuality="high"
        setSelectedQuality={vi.fn()}
        selectedVisionModel="gpt-4o"
        setSelectedVisionModel={vi.fn()}
        availableVisionModels={mockVisionModels}
        selectedImageGenModel="flux-pro"
        setSelectedImageGenModel={vi.fn()}
        availableImageModels={mockImageModels}
        generationStrategy="grid_first"
        imageGenConcurrency={16}
        analyzeConcurrency={2}
      />
    );

    // 检查标题与导航
    expect(screen.getByText(/种草工坊 · 全局生产预设与大模型配置/)).toBeDefined();
    expect(screen.getByText('默认拍摄规格')).toBeDefined();
    expect(screen.getByText('AI 模型与性能并发')).toBeDefined();

    // 切换分镜数（select 元素）
    const shotSelect = screen.getByDisplayValue('1 镜');
    fireEvent.change(shotSelect, { target: { value: '4' } });
    expect(setSelectedShotCount).toHaveBeenCalledWith(4);

    // 切换画幅
    const aspect16Btn = screen.getByText('16:9');
    fireEvent.click(aspect16Btn);
    expect(setSelectedAspect).toHaveBeenCalledWith('16:9');

    // 点击完成关闭
    const doneBtn = screen.getByText('完成');
    fireEvent.click(doneBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('SYSTEM_MASTER_RECIPES 仅保留图1对应的【珠宝首饰全品类 (V6.0)】，彻底剔除其他三个多余项及相关提示词', async () => {
    const { SYSTEM_MASTER_RECIPES } = await import('../batchTypes');
    expect(SYSTEM_MASTER_RECIPES).toHaveLength(1);
    expect(SYSTEM_MASTER_RECIPES[0].id).toBe('recipe_jewelry_master');
    expect(SYSTEM_MASTER_RECIPES[0].name).toBe('珠宝首饰全品类 (V6.0)');

    // 验证彻底不存在其他多余的 3 个项及其提示词
    const ids = SYSTEM_MASTER_RECIPES.map(r => r.id);
    expect(ids).not.toContain('auto');
    expect(ids).not.toContain('arch_atomic_asset_hub');
    expect(ids).not.toContain('arch_jewelry_master');

    const names = SYSTEM_MASTER_RECIPES.map(r => r.name);
    expect(names.some(n => n.includes('智能自由创作'))).toBe(false);
    expect(names.some(n => n.includes('提示词原子资产库'))).toBe(false);
    expect(names.some(n => n.includes('💎 珠宝首饰 8段式装配骨架与物理守卫'))).toBe(false);
  });
});
