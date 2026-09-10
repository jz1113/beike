import { describe, expect, it, vi, afterEach } from 'vitest';
import { GET, POST } from '../video';

describe('AI 视频生成路由与轮询测试 (/api/generate/video)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('提交视频生成时若提示词为空应直接拦截报错', async () => {
    const req = new Request('http://localhost/api/generate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('视频提示词不能为空');
  });

  it('轮询状态若未提供 taskId 应返回 400', async () => {
    const req = new Request('http://localhost/api/generate/video');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('缺少 taskId 参数');
  });

  it('轮询支持解析 Seedance 官方返回格式 (content[0].video_url.url)', async () => {
    const taskId = 'cgt-20260408182454-5dqsn';
    const mockOfficialResponse = {
      id: taskId,
      status: 'succeeded',
      duration: 5,
      ratio: '16:9',
      resolution: '720p',
      content: [
        {
          type: 'video_url',
          video_url: {
            url: 'https://cdn.volces.com/videos/output_20260408.mp4',
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/seedance/v3/contents/generations/tasks/cgt-20260408182454-5dqsn')) {
        return new Response(JSON.stringify(mockOfficialResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const req = new Request(`http://localhost/api/generate/video?taskId=${taskId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.taskId).toBe(taskId);
    expect(json.status).toBe('SUCCESS');
    expect(json.resultUrl).toBe('https://cdn.volces.com/videos/output_20260408.mp4');
  });

  it('轮询在任务进行中时正确返回 IN_PROGRESS', async () => {
    const taskId = 'cgt-20260408182454-queued';
    const mockQueuedResponse = {
      id: taskId,
      status: 'queued',
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify(mockQueuedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const req = new Request(`http://localhost/api/generate/video?taskId=${taskId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe('IN_PROGRESS');
    expect(json.resultUrl).toBe('');
  });

  it('轮询支持解析网关返回的 content 对象格式 (content.video_url，彻底杜绝完成但卡住的严重缺陷)', async () => {
    const taskId = '2096845789170372609';
    const mockComflyResponse = {
      content: {
        video_url: 'https://webstatic.aiproxy.vip/output/20260907/0f6ed2d6-25b2-437d-b5b2-64e7b9e9dd98.mp4',
      },
      status: 'succeeded',
      duration: '6.099000',
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify(mockComflyResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const req = new Request(`http://localhost/api/generate/video?taskId=${taskId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.taskId).toBe(taskId);
    expect(json.status).toBe('SUCCESS');
    expect(json.resultUrl).toBe('https://webstatic.aiproxy.vip/output/20260907/0f6ed2d6-25b2-437d-b5b2-64e7b9e9dd98.mp4');
  });

  it('POST 视频任务提交具备强幂等性：同一 clientTaskId 重复请求直接复用结果，杜绝二次扣费', async () => {
    let fetchCount = 0;
    const clientTaskId = `test-idempotent-${Date.now()}`;
    const mockTaskId = `gw-task-${Date.now()}`;

    globalThis.fetch = vi.fn().mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/seedance/') || url.includes('/v2/videos')) {
        fetchCount += 1;
      }
      return new Response(JSON.stringify({ task_id: mockTaskId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const bodyPayload = {
      clientTaskId,
      prompt: '测试防重复提交视频任务，确保资金安全',
      model: 'doubao-seedance-2.5',
      duration: 5,
    };

    // 第一次提交
    const req1 = new Request('http://localhost/api/generate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.success).toBe(true);
    expect(json1.taskId).toBe(mockTaskId);
    expect(fetchCount).toBe(1);

    // 第二次带相同 clientTaskId 提交 (模拟用户重复点击或短时间内重试)
    const req2 = new Request('http://localhost/api/generate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.taskId).toBe(mockTaskId);
    // 关键断言：上游 fetch 次数依然为 1，完全被幂等拦截，绝未发起第二次网关扣费！
    expect(fetchCount).toBe(1);
  });

  it('轮询支持解析 Wan 官方格式 (output.task_status: SUCCEEDED, output.video_url)', async () => {
    const taskId = '0385dc79-5ff8-4d82-bcb6-999999999999';
    const mockWanResponse = {
      request_id: '4909100c-7b5a-9f92-bfe5-111111111111',
      output: {
        task_id: taskId,
        task_status: 'SUCCEEDED',
        video_url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo/wan_video.mp4',
      },
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(taskId)) {
        return new Response(JSON.stringify(mockWanResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const req = new Request(`http://localhost/api/generate/video?taskId=${taskId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.taskId).toBe(taskId);
    expect(json.status).toBe('SUCCESS');
    expect(json.resultUrl).toBe('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo/wan_video.mp4');
  });

  it('提交 Wan 官方格式任务时正确从 output.task_id 提取任务 ID', async () => {
    const mockTaskId = 'wan-task-0385dc79-5ff8';
    const mockWanSubmitResponse = {
      output: {
        task_status: 'PENDING',
        task_id: mockTaskId,
      },
      request_id: '4909100c-7b5a-9f92-bfe5-xxxxxx',
    };

    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url?.url || '';
      if (urlStr.includes('/qwen/') || urlStr.includes('/video-generation/')) {
        capturedHeaders = init?.headers;
      }
      return new Response(JSON.stringify(mockWanSubmitResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const req = new Request('http://localhost/api/generate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '一只小猫在月光下奔跑',
        model: 'wan3.0-video',
        duration: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.taskId).toBe(mockTaskId);
    expect(json.family).toBe('wan');
    expect((capturedHeaders as Record<string, string>)?.['X-DashScope-Async']).toBe('enable');
  });
});

