import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { SalesScriptReviewer } from './SalesScriptReviewer';

describe('action storyboard reader', () => {
  it('opens the depth preview beside the script with editing tools hidden', () => {
    const script = normalizeScriptTemplate({
      title: '街拍一镜到底推拉',
      durationSec: 6,
      format: 'presenter',
      voiceMode: 'speech',
      shots: [{ start: 0, end: 6, beats: [
        { start: 0, end: 2, referenceActionRaw: '抬手', actionTemplate: '抚摸蓝色冲锋衣胸口门襟', requiredView: 'worn' },
        { start: 2, end: 6, referenceActionRaw: '转身', actionTemplate: '转身' },
      ] }],
      sourceExclusions: [{ type: 'product', term: '蓝色冲锋衣', replacementRule: '替换为当前商品' }],
      review: ['请核对第 2 秒切点'],
    })!;
    const html = renderToStaticMarkup(createElement(SalesScriptReviewer, {
      linkedVideo: createElement('video', { controls: true, src: '/depth.mp4' }),
      draft: { status: 'draft', script, model: 'gemini-2.5-pro', promptVersion: 'v3' },
      taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: () => {},
      saving: false,
      onChange: () => {},
      onBack: () => {},
      onSaveDraft: () => {},
      onConfirm: () => {},
    }));
    expect(html).toContain('编辑脚本');
    expect(html).not.toContain('脚本设定');
    expect(html).not.toContain('分镜目录');
    expect(html).toContain('aria-label="动作素材分镜表"');
    expect(html).toMatch(/<th scope="row">01.1<\/th>[\s\S]*?00:00 - 00:02[\s\S]*?抬手[\s\S]*?<th scope="row">01.2<\/th>[\s\S]*?00:02 - 00:06[\s\S]*?转身/);
    expect(html).not.toContain('镜内动作时间轴');
    expect(html).toMatch(/<aside[^>]*aria-label="深度视频预览"[^>]*>[\s\S]*?<video[\s\S]*?<\/aside>[\s\S]*?aria-label="脚本分镜正文"/);
    expect(html).toContain('确认入库');
    expect(html).not.toContain('确认并选用');
    expect(html).not.toContain('确认入库并选用');
    expect(html).not.toContain('脚本总时长秒数');
    expect(html).not.toContain('原片专属剥离清单');
    expect(html).not.toContain('后续所需资产槽位汇总');
    expect(html).not.toContain('复制提示词骨架');
    expect(html).toContain('1 处原片专属词残留');
    expect(html).not.toContain('请核对第 2 秒切点');
    expect(html).not.toContain('原片声音与字幕');
    expect(html).not.toContain('编辑此段分镜与时间');
    expect(html).not.toContain('播放此段');
  });
});
