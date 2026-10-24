import { describe, expect, it } from 'vitest';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { presentAgentTurn } from './agentToolActivity';

const planSummary = JSON.stringify({
  success: true,
  plan: [
    { title: '拆解「图腾」语义', status: 'in_progress' },
    { title: '梳理学术脉络', status: 'pending' },
    { title: '确定选题切口', status: 'completed', evidence: '已核对出处' },
    { title: '核对原典', status: 'blocked', evidence: '缺少文献' },
  ],
});

function call(id: string, name: string, args = '{}', status: 'running' | 'done' | 'error' = 'done'): AssistantItem {
  return { id, kind: 'toolCall', createdAt: 1, name, displayName: name, args, callId: id, status };
}

function result(id: string, name: string, summary: string, status: 'done' | 'error' = 'done'): AssistantItem {
  return { id: `${id}__result`, kind: 'toolResult', createdAt: 2, name, displayName: name, status, summary };
}

describe('presentAgentTurn', () => {
  it('turns a stored plan payload into step lines and hides the JSON', () => {
    const [block] = presentAgentTurn([
      call('plan', 'update_plan', '{"steps":[{"title":"旧参数","status":"pending"}]}'),
      result('plan', 'update_plan', planSummary),
    ]);
    expect(block?.kind).toBe('tools');
    if (block?.kind !== 'tools') return;
    expect(block.group.summary).toBe('更新了执行计划');
    expect(block.group.expandable).toBe(true);
    expect(block.group.lines[0]?.text).toBe('已更新执行计划');
    expect(block.group.lines[0]?.details).toEqual([
      '进行中 拆解「图腾」语义',
      '待办 梳理学术脉络',
      '已完成 确定选题切口',
      '受阻 核对原典',
    ]);
    expect(JSON.stringify(block.group)).not.toContain('{"plan"');
    expect(JSON.stringify(block.group)).not.toContain('evidence');
  });

  it('joins consecutive tools into one collapsed sentence and keeps reasoning between groups', () => {
    const blocks = presentAgentTurn([
      call('plan', 'update_plan'),
      result('plan', 'update_plan', '{"success":true}'),
      call('file', 'read_attached_document', '{"document_name":"template_following.md"}'),
      result('file', 'read_attached_document', '{"excerpt":"正文"}'),
      { id: 'think', kind: 'agentReasoning', createdAt: 3, content: '先看词源。' },
      call('code', 'execute_code', '{"code":"1"}'),
      result('code', 'execute_code', '代码执行完成'),
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(['tools', 'item', 'tools']);
    const [first, , third] = blocks;
    if (first?.kind !== 'tools' || third?.kind !== 'tools') throw new Error('expected tool groups');
    expect(first.group.summary).toBe('更新了执行计划、读取了文件');
    expect(first.group.expandable).toBe(true);
    expect(first.group.lines.map((line) => line.text)).toEqual(['已更新执行计划', '已读取 template_following.md']);
    expect(third.group.summary).toBe('运行了代码');
    expect(third.group.expandable).toBe(true);
    expect(third.group.lines[0]?.details).toEqual(['代码执行完成']);
  });

  it('leaves a bare command as one line and marks running or failed calls', () => {
    const [done] = presentAgentTurn([
      call('code', 'execute_code'),
      result('code', 'execute_code', '{"success":true}'),
    ]);
    const [running] = presentAgentTurn([call('plan', 'update_plan', '{}', 'running')]);
    const [failed] = presentAgentTurn([
      call('plan', 'update_plan', '{}', 'error'),
      result('plan', 'update_plan', '{"success":false,"error":"计划需包含步骤"}', 'error'),
    ]);
    if (done?.kind !== 'tools' || running?.kind !== 'tools' || failed?.kind !== 'tools') throw new Error('expected tool groups');
    expect(done.group.expandable).toBe(false);
    expect(done.group.summary).toBe('运行了代码');
    expect(running.group.summary).toBe('正在更新执行计划');
    expect(running.group.tone).toBe('running');
    expect(failed.group.summary).toBe('未能更新执行计划');
    expect(failed.group.tone).toBe('error');
    expect(failed.group.lines[0]?.details).toEqual(['计划需包含步骤']);
    expect(JSON.stringify(failed.group)).not.toContain('success');
  });

  it('counts viewed images without dumping the payload', () => {
    const [block] = presentAgentTurn([
      call('frame', 'extract_video_detailed_frames'),
      {
        id: 'frame__result',
        kind: 'toolResult',
        createdAt: 2,
        name: 'extract_video_detailed_frames',
        displayName: '提取关键镜头特写画面',
        status: 'done',
        summary: '{"images":["a","b"]}',
        visualImages: [{ url: 'https://example.com/a.jpg' }, { url: 'https://example.com/b.jpg' }],
      },
    ]);
    if (block?.kind !== 'tools') throw new Error('expected a tool group');
    expect(block.group.summary).toBe('已查看 2 张图像');
    expect(block.group.expandable).toBe(false);
    expect(JSON.stringify(block.group)).not.toContain('https://example.com');
  });

  it('formats skill and skill resource reads cleanly with a separator', () => {
    const [block] = presentAgentTurn([
      call('skill', 'read_skill', '{"skill_id":"prompt-reverse-engineer"}'),
      result('skill', 'read_skill', '已读取技能 提示词反推专家'),
      call('file', 'read_skill_file', '{"path":"assetDeconstruct/REVERSE_ENGINE_CORE_SPEC"}'),
      result('file', 'read_skill_file', '已读取 assetDeconstruct/REVERSE_ENGINE_CORE_SPEC'),
    ]);
    if (block?.kind !== 'tools') throw new Error('expected a tool group');
    expect(block.group.summary).toBe('读取了技能、读取了技能资料');
    expect(block.group.lines.map((line) => line.text)).toEqual([
      '已读取技能 提示词反推专家',
      '已读取 assetDeconstruct/REVERSE_ENGINE_CORE_SPEC',
    ]);
    expect(block.group.lines.map((line) => line.details)).toEqual([[], []]);
  });
});
