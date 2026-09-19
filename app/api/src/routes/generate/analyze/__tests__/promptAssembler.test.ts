import { describe, expect, it, vi } from 'vitest';
vi.mock('@beike/server-kit/prisma', () => ({
  prisma: { actionAsset: { update: vi.fn(async () => ({})) } },
}));
import { assembleStoryboardShots } from '../../../../services/analyze/promptAssembler';
import { assembleGrid2x2Prompt } from '@beike/domain/drawing';

const actions = [
  { id: 'phone-walk', code: 'A-walk', title: '门前提袋全身持机', action: '站立回身，右手持手机自然垂落身侧，左脚轻迈向前', camera: '35mm平视全身机位' },
  { id: 'phone-car', code: 'A-car', title: '车内前置自拍', action: '坐在副驾座椅内，单手举手机进行前置自拍，另一手轻搭扶手', camera: '24mm半身自拍机位' },
  { id: 'phone-detail', code: 'A-detail', title: '手机边框局部特写', action: '双手轻握手机边缘，镜头聚焦商品边框细节', camera: '85mm局部细节特写' },
  { id: 'phone-window', code: 'A-window', title: '窗边双手操作', action: '倚靠窗边双手横持手机操作，视线自然落在屏幕', camera: '50mm平视中景' },
];
const rawOutput = JSON.stringify({
  master_scene: '宽敞生活空间', identity_bible: '同一位年轻女生',
  look_bible: '身穿白色衬衫', look_parts: { top: '白色衬衫', bottom: '蓝色长裤' },
  product_role: 'held_object', product_fingerprint: '手机',
  prompts: actions.map((_, index) => ({ shot_no: index + 1, title: '模型默认微距自拍', action: '一手托腮', angle: '胸部以上肖像', prompt: '托腮自拍；手机靠近锁骨；85mm微距镜头；默认模板覆盖' })),
});

const assemble = (selectedActions = actions) => assembleStoryboardShots({
  rawOutput, shotCount: 4, productTitle: '手机', productIndex: 0,
  isNoModel: false, hasAnchorFace: false, assetLibraryData: { actions: selectedActions },
  actualModelUsed: 'test', triedModels: ['test'], visionUsage: {},
});

describe('bound storyboard actions', () => {
  it('keeps prompt, action, camera, title and attribution bound to each selected asset', async () => {
    const result = await assemble();
    result.prompts.forEach((shot, index) => {
      const asset = actions[index];
      expect(shot.action).toBe(asset.action);
      expect(shot.camera_focal_length).toBe(asset.camera);
      expect(shot.title).toBe(asset.title);
      expect(shot.appliedActionId).toBe(asset.id);
      expect(shot.applied_action).toContain(asset.title);
      expect(shot.prompt).toContain(asset.action);
      expect(shot.prompt).not.toContain('一手托腮');
      expect(shot.optics).not.toContain('佩戴首饰');
    });
    expect(result.prompts[0].optics).not.toContain('微距');
    const grid = assembleGrid2x2Prompt({ productRole: 'held_object', productFingerprint: '手机' }, result.prompts);
    expect(grid).toContain('35mm平视全身机位');
    expect(grid).toContain('坐在副驾座椅内');
    expect(grid).toContain('自然手持或使用');
    expect(grid).not.toContain('必为超清微距');
    expect(grid).not.toContain('首饰自然置于');
  });

  it('does not silently reuse an asset id to attribute extra generated shots', async () => {
    const result = await assemble(actions.slice(0, 1));
    expect(result.prompts[0].appliedActionId).toBe('phone-walk');
    expect(result.prompts[1].appliedActionId).toBeUndefined();
    expect(result.prompts[1].applied_action).toBeUndefined();
  });
});

it('static asset overrides model portrait defaults and omits persona/outfit', async () => {
  const result = await assemble([{ id: 'still', code: 'A-still', title: '纯静物台面陈列', action: '无人物，手机平放台面，侧边支撑', camera: '50mm俯视近景' }]);
  const shot = result.prompts[0];
  expect(shot.has_human).toBe(false);
  expect(shot.shot_type).toBe('pure_product');
  expect(shot.applied_persona).toBeUndefined();
  expect(shot.applied_outfit).toBeUndefined();
  expect(shot.prompt).not.toContain('同一位模特身穿');
  expect(shot.prompt).not.toContain('服装穿搭：');
});
