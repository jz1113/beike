export interface AssetTaskBatch {
  batchId: string;
  title?: string;
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
  createdAt: string | number;
  tasks: any[];
}

// 智能提取提示词/标题中的主题前缀（去除分镜号、第X张等，以便将同一次多图生成的不同分镜准确识别为同批任务）
export function extractBaseTheme(prompt?: string, title?: string): string {
  const raw = `${title || ''} ${prompt || ''}`.trim();
  if (!raw) return '';
  return raw
    .replace(/第\s*\d+\s*[张幅页图步套]/g, '')
    .replace(/分镜\s*[\d一二三四五六七八九十]+/g, '')
    .replace(/【分镜\s*[\d一二三四五六七八九十]+】/g, '')
    .replace(/镜头\s*[\d一二三四五六七八九十]+/g, '')
    .replace(/shot\s*\d+/gi, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '')
    .replace(/（\s*\d+\s*\/\s*\d+\s*）/g, '')
    .replace(/[，,。.\n\r]/g, ' ')
    .trim()
    .slice(0, 32);
}

export function areTasksInSameBatch(taskA: any, timeA: number, taskB: any, timeB: number): boolean {
  // 1. 如果明确有相同的 batchId，直接判定为同一批
  if (taskA.batchId && taskB.batchId && taskA.batchId === taskB.batchId) {
    return true;
  }

  // 2. 时间差超过 90 秒，通常不是同一次批量生成
  const timeDiff = Math.abs(timeA - timeB);
  if (timeDiff > 90000) {
    return false;
  }

  // 3. 如果关联了同一个商品主体 (productId 相同且非空)
  if (taskA.productId && taskB.productId && taskA.productId === taskB.productId) {
    return true;
  }

  // 4. 提取公共主题并比对
  const themeA = extractBaseTheme(taskA.prompt, taskA.title);
  const themeB = extractBaseTheme(taskB.prompt, taskB.title);

  if (themeA && themeB) {
    if (themeA === themeB || themeA.includes(themeB) || themeB.includes(themeA)) {
      return true;
    }
    let commonLen = 0;
    const minLen = Math.min(themeA.length, themeB.length);
    while (commonLen < minLen && themeA[commonLen] === themeB[commonLen]) {
      commonLen++;
    }
    if (commonLen >= 4) {
      return true;
    }
  }

  // 5. 如果提示词完全一致，且时间差在 60 秒内 (同提示词批量生成多张)
  if (taskA.prompt && taskB.prompt && taskA.prompt.trim() === taskB.prompt.trim() && timeDiff < 60000) {
    return true;
  }

  // 6. 如果在极短时间内 (4秒内) 连续生成，同模型同尺寸
  if (timeDiff < 4000 && taskA.model === taskB.model) {
    return true;
  }

  return false;
}

// 智能按批次聚合任务 (高性能 O(N) 映射与时间戳缓存，支持相同 batchId、相同提示词近邻时间聚合)
export function groupTasksIntoBatches(tasks: any[]): AssetTaskBatch[] {
  if (!tasks || tasks.length === 0) return [];

  // 1. 预解析并缓存时间戳
  const items = tasks.map((t, idx) => ({
    task: t,
    time: typeof t.createdAt === 'number' ? t.createdAt : new Date(t.createdAt || 0).getTime(),
    idx
  }));

  // 倒序排序（最新优先）
  items.sort((a, b) => b.time - a.time);

  const groups: AssetTaskBatch[] = [];
  const batchIdMap = new Map<string, AssetTaskBatch>();

  // 2. 高效哈希与近邻时间桶聚类
  items.forEach(({ task, time, idx }) => {
    let targetBatch: AssetTaskBatch | undefined;

    // A. 优先通过 batchId 匹配
    if (task.batchId) {
      targetBatch = batchIdMap.get(task.batchId);
    }

    // B. 若无 batchId 匹配，智能寻找时间相近且主题一致的近期批次
    if (!targetBatch) {
      for (let i = groups.length - 1; i >= 0; i--) {
        const candidate = groups[i];
        const candTime = typeof candidate.createdAt === 'number'
          ? candidate.createdAt
          : new Date(candidate.createdAt).getTime();

        if (Math.abs(time - candTime) > 90000) break;

        const candidatePrimary = candidate.tasks[0];
        if (areTasksInSameBatch(task, time, candidatePrimary, candTime)) {
          targetBatch = candidate;
          break;
        }
      }
    }

    if (targetBatch) {
      targetBatch.tasks.push(task);
    } else {
      const uniqueFallbackId = task.batchId || `batch-${task.id || task.taskId || time}-${idx}`;
      const isTaskVideo = task.mediaType === 'video' || task.resultUrl?.includes('.mp4');
      const taskQuality = isTaskVideo
        ? (task.quality === 'high' || !task.quality ? '720P' : task.quality)
        : (task.quality || 'medium');

      const newBatch: AssetTaskBatch = {
        batchId: uniqueFallbackId,
        prompt: task.prompt || '',
        title: task.title,
        model: task.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2'),
        size: task.size || '3:4',
        quality: taskQuality,
        createdAt: task.createdAt || time,
        tasks: [task]
      };

      groups.push(newBatch);
      if (task.batchId) {
        batchIdMap.set(task.batchId, newBatch);
      }
    }
  });

  // 3. 确保每个批次内的分镜卡片严格按照分镜序号正序排列
  groups.forEach(g => {
    if (g.tasks.length > 1) {
      g.tasks.sort((a, b) => {
        if (typeof a.shotNo === 'number' && typeof b.shotNo === 'number') {
          return a.shotNo - b.shotNo;
        }
        const numA = (a.title || a.prompt)?.match(/第\s*(\d+)\s*张/)?.[1] || (a.title || a.prompt)?.match(/分镜\s*(\d+)/)?.[1];
        const numB = (b.title || b.prompt)?.match(/第\s*(\d+)\s*张/)?.[1] || (b.title || b.prompt)?.match(/分镜\s*(\d+)/)?.[1];
        if (numA && numB) {
          return parseInt(numA, 10) - parseInt(numB, 10);
        }
        const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
        const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });
    }
  });

  return groups;
}
