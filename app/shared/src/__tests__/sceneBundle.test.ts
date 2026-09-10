import { describe, expect, it } from 'vitest';
import {
  actionRecordsToShots,
  formatSceneBundleApplyText,
  formatSingleShotApplyText,
  harmonizedTemplatesToShots,
  resolveShotsForScene,
} from '../sceneBundle';

describe('sceneBundle', () => {
  const scene = {
    id: 'scene-1',
    title: '茶山晚夏',
    description: '云雾缭绕的茶山梯田，青绿茶垄延伸至远方',
    lighting: '阴天自然漫射光，面部柔和无硬阴影',
  };

  it('resolveShotsForScene prefers linked DB actions', () => {
    const shots = resolveShotsForScene(scene, [
      {
        id: 'a1',
        title: '侧颜微风抓拍',
        action: '自然侧身看窗外天光，发丝随风微动',
        shotType: 'profile_45',
        shotOrder: 1,
        camera: 'iPhone 50mm',
        provenance: 'seed',
        sceneId: 'scene-1',
      },
    ]);

    expect(shots).toHaveLength(1);
    expect(shots[0].id).toBe('a1');
    expect(shots[0].provenance).toBe('seed');
  });

  it('resolveShotsForScene falls back to harmonized virtual shots', () => {
    const shots = resolveShotsForScene(scene, []);
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(shots[0].provenance).toBe('harmonized');
    expect(shots[0].id).toMatch(/^harmonized-scene-1-/);
  });

  it('harmonizedTemplatesToShots caps at 4 shots', () => {
    const shots = harmonizedTemplatesToShots('scene-x', Array.from({ length: 6 }, (_, i) => ({
      title: `镜${i + 1}`,
      sceneSuffix: '测试场景',
      action: `动作${i + 1}`,
      expression: '自然',
      camera: '35mm',
      angle: '平视',
      hasHuman: true,
      shotType: 'half_body',
    })));
    expect(shots).toHaveLength(4);
    expect(shots[3].shotOrder).toBe(4);
  });

  it('actionRecordsToShots sorts by shotOrder', () => {
    const shots = actionRecordsToShots([
      { id: 'b', title: 'B', action: '动作B', shotType: 'half_body', shotOrder: 2 },
      { id: 'a', title: 'A', action: '动作A', shotType: 'macro_detail', shotOrder: 1 },
    ]);
    expect(shots[0].id).toBe('a');
    expect(shots[1].id).toBe('b');
  });

  it('formatSceneBundleApplyText joins scene and all shots', () => {
    const text = formatSceneBundleApplyText(scene, [
      {
        id: 's1',
        title: '侧颜抓拍',
        action: '自然侧身看天光',
        shotType: 'profile_45',
        shotOrder: 1,
        provenance: 'seed',
      },
    ]);
    expect(text).toContain('【场景空间】：茶山晚夏');
    expect(text).toContain('【分镜1·侧颜抓拍】');
  });

  it('formatSingleShotApplyText applies one shot only', () => {
    const text = formatSingleShotApplyText(scene, {
      id: 's1',
      title: '微距特写',
      action: '极近距离对焦首饰细节',
      shotType: 'macro_detail',
      shotOrder: 2,
      provenance: 'harmonized',
    });
    expect(text).toContain('【场景空间】');
    expect(text).toContain('【分镜2·微距特写】');
    expect(text).not.toContain('【分镜1');
  });
});
