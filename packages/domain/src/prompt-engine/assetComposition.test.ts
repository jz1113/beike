import { describe, expect, it } from 'vitest';
import { assembleGrid2x2Prompt, assembleOriginalShotPrompt } from './assembler';
import { buildVisionSystemPrompt } from '../vision';

const phoneBible = {
  identityBible: '同一位年轻女生', lookBible: '白色衬衫搭配蓝色长裤',
  masterScene: '汽车副驾座椅内', productRole: 'held_object' as const, productFingerprint: '手机',
};

describe('asset composition survives generation assembly', () => {
  it('preserves multiple phone action sets instead of replacing them with a common sequence', () => {
    const sets = [
      [
        { action: '站立回身，手持手机自然垂落身侧', angle: '平视全身', camera_focal_length: '35mm' },
        { action: '坐在副驾座椅内单手前置自拍', angle: '半身自拍', camera_focal_length: '24mm' },
        { action: '双手横持手机操作', angle: '平视中景', camera_focal_length: '50mm' },
        { action: '坐姿双手把手机置于膝上', angle: '微俯角半身', camera_focal_length: '50mm' },
      ],
      [
        { action: '侧身倚靠，手机轻贴耳际接听', angle: '侧面半身', camera_focal_length: '50mm' },
        { action: '低头双手握持手机阅读屏幕', angle: '俯视中景', camera_focal_length: '35mm' },
        { action: '自然手持手机，聚焦边框细节', angle: '局部微距特写', camera_focal_length: '85mm' },
        { action: '侧身举手机向远处拍照', angle: '全身侧后方', camera_focal_length: '35mm' },
      ],
    ];
    const grids = sets.map(shots => assembleGrid2x2Prompt(phoneBible, shots));
    grids.forEach((grid, setIndex) => {
      sets[setIndex].forEach(shot => { expect(grid).toContain(shot.action); expect(grid).toContain(shot.angle); });
      expect(grid).not.toContain('必为超清微距');
      expect(grid).not.toContain('严禁远景全身');
      expect(grid).not.toContain('佩戴首饰');
    });
    expect(grids[0]).not.toContain('局部超清微距特写');
    const thirdPanel = grids[1].split('【左下格·分镜3】')[1].split('【右下格·分镜4】')[0];
    expect(thirdPanel).toContain('局部微距特写');
    const firstPanel = grids[1].split('【左上格·分镜1】')[1].split('【右上格·分镜2】')[0];
    expect(firstPanel).not.toContain('微距');
    expect(grids[0]).not.toEqual(grids[1]);
  });

  it('preserves jewelry asset pose while retaining correct placement and appearance anchors', () => {
    const bible = { ...phoneBible, productRole: 'worn_accessory' as const, productFingerprint: '纯银手镯' };
    const shot = { shot_no: 1, action: '站立侧身，左手自然搭在腰侧展露手镯', angle: '平视全身', camera_focal_length: '35mm' };
    const prompt = assembleOriginalShotPrompt(bible, shot, { preserveComposition: true });
    expect(prompt).toContain(shot.action);
    expect(prompt).toContain('平视全身');
    expect(prompt).toContain('35mm');
    expect(prompt).toContain('单侧左手手腕');
    expect(prompt).toContain('@图片1');
    expect(prompt).not.toContain('Tight Wrist Close-Up');
    expect(prompt).not.toContain('发簪长杆');
    expect(prompt).not.toContain('颈间佩戴 @图片1 所示项链');
    expect(prompt).not.toContain('@佩戴');
    const grid = assembleGrid2x2Prompt(bible, [shot]);
    expect(grid).toContain(shot.action);
    expect(grid).not.toContain('超清微距对焦锁定首饰');
  });

  it('removes repeated framing words without forcing a new crop', () => {
    const grid = assembleGrid2x2Prompt(phoneBible, [
      { action: '侧身回望，单手握持手机', angle: '侧身回望中中近景半身中近景半身中近景机位' },
    ]);
    expect(grid).not.toContain('中中近景');
    expect(grid).not.toContain('半身中近景半身中近景');
    expect(grid).toContain('侧身回望');
  });

  it('analysis instructions bind assets without assigning fixed template roles to list positions', () => {
    const prompt = buildVisionSystemPrompt({
      productTitle: '手机', shotCount: 4,
      assetLibraryData: { actions: [{ id: 'action-1', code: 'A-1', title: '站立全身持机', action: '站立全身持机', camera: '35mm' }] },
    });
    expect(prompt).toContain('保留对应资产的真实姿态');
    expect(prompt).toContain('站立全身持机');
    expect(prompt).not.toContain('分镜 1 必须为');
    expect(prompt).not.toContain('专属超清微距/近景');
    expect(prompt).not.toContain('全员 100% 锁定为半身');
  });
});
