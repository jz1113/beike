import { describe, expect, it } from 'vitest';
import { formatUserError, unwrapJsonErrorMessage } from './upstreamErrors';

describe('formatUserError', () => {
  it('turns an upstream deadline into a readable image timeout', () => {
    expect(formatUserError('context deadline exceeded')).toBe('上游生图超时');
    expect(formatUserError('提交响应未确认：context deadline exceeded。请先在上游任务记录核实是否已创建任务，避免重复生成'))
      .toBe('提交响应未确认：上游生图超时。请先在上游任务记录核实是否已创建任务，避免重复生成');
  });

  it('unwraps nested JSON error wrappers from video and image providers', () => {
    const raw = '{"code":"1501","message":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试"}';
    expect(unwrapJsonErrorMessage(raw)).toContain('参考视频未通过安全检测');
    expect(unwrapJsonErrorMessage(raw)).not.toContain('"code"');
    expect(formatUserError(raw)).toContain('参考视频未通过安全检测');
  });

  it('redacts signed OSS reference URLs and decodes filenames in error messages', () => {
    const truncatedSignedUrl =
      'https://jinzhuo11.oss-cn-beijing.aliyuncs.com/seedance/refs/202610/%E8%A7%86%E9%A2%91%E5%8F%82%E8%80%831.mp4?x-oss-credential=LTAI5t6uxgrYLFmsaBCUc1SX%2F20261031%2Fcn-beijing%2Foss';
    const formattedBare = formatUserError(truncatedSignedUrl);
    expect(formattedBare).toContain('【参考视频：视频参考1.mp4】处理失败');
    expect(formattedBare).not.toContain('x-oss-credential');

    const withReason = `${truncatedSignedUrl}: 视频素材时长超出限制`;
    const formattedWithReason = formatUserError(withReason);
    expect(formattedWithReason).toBe('【参考视频：视频参考1.mp4】: 视频素材时长超出限制');
  });
});
