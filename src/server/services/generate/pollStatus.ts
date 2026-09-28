export type PollRecord = {
  status?: string | null;
  resultUrl?: string | null;
  failReason?: string | null;
};

export type PollDecision = {
  httpStatus: number;
  body: {
    success: boolean;
    taskId: string;
    status?: string;
    progress?: string;
    resultUrl?: string;
    failReason?: string;
    error?: string;
  };
};

/** `direct_` 同步任务：没有结果图时不得报 SUCCESS。 */
export function decideDirectImagePoll(
  taskId: string,
  record: PollRecord | null,
  dbError: boolean,
): PollDecision {
  if (dbError) {
    return {
      httpStatus: 503,
      body: { success: false, taskId, error: '查询同步任务失败，请稍后重试' },
    };
  }
  if (record?.resultUrl) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        taskId,
        status: 'SUCCESS',
        progress: '100%',
        resultUrl: record.resultUrl,
        failReason: '',
      },
    };
  }
  if (record?.status === 'FAILURE') {
    return {
      httpStatus: 200,
      body: {
        success: true,
        taskId,
        status: 'FAILURE',
        progress: '0%',
        resultUrl: '',
        failReason: record.failReason || '同步任务失败',
      },
    };
  }
  if (record) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        taskId,
        status: 'FAILURE',
        progress: '0%',
        resultUrl: '',
        failReason: '同步任务未返回结果图',
      },
    };
  }
  return {
    httpStatus: 404,
    body: { success: false, taskId, error: '未找到同步任务记录' },
  };
}

/**
 * 全部探测端点都未返回有效状态。
 * 仅在数据库已有终态时透传；否则返回 QUERY_FAILED，禁止伪装成 IN_PROGRESS 25%。
 */
export function decideProbeMissPoll(
  taskId: string,
  record: PollRecord | null,
  dbError: boolean,
  kind: 'image' | 'video' = 'image',
): PollDecision {
  const failedFallback = kind === 'video' ? '视频任务失败' : '生图任务失败';
  const queryError = kind === 'video' ? '暂时无法查询云端视频任务状态' : '暂时无法查询云端任务状态';
  if (dbError) {
    return {
      httpStatus: 503,
      body: { success: false, taskId, error: '查询任务状态失败，请稍后重试' },
    };
  }
  if (record?.resultUrl) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        taskId,
        status: 'SUCCESS',
        progress: '100%',
        resultUrl: record.resultUrl,
        failReason: '',
      },
    };
  }
  if (record?.status === 'FAILURE') {
    return {
      httpStatus: 200,
      body: {
        success: true,
        taskId,
        status: 'FAILURE',
        progress: '0%',
        resultUrl: '',
        failReason: record.failReason || failedFallback,
      },
    };
  }
  return {
    httpStatus: 200,
    body: {
      success: true,
      taskId,
      status: 'QUERY_FAILED',
      progress: '',
      error: queryError,
    },
  };
}
