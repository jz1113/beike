import { checkpointDatabase } from '@server/infrastructure/database/prisma';
import { recoverOrphanUnsubmittedTasks } from '../services/tasks/taskRecovery';
import { drainDepthVideoQueue } from '../services/depth/depthVideoPipeline';
import { flushItemQueue } from '../services/library/itemPersistQueue';
import { purgeExpiredSubmissionReceipts } from '../services/tasks/submissionGuard';
import { purgeExpiredMediaReviews } from '../services/library/mediaReviewQueue';

const SHUTDOWN_DRAIN_MS = 5_000;

async function withTimeout(promise: Promise<unknown>, ms: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } catch (err) {
    console.error(`[API] ${label}:`, err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recoverOnBoot(): Promise<void> {
  await checkpointDatabase().catch((err) => {
    console.error('[API] boot checkpointDatabase 失败:', err);
  });
  try {
    const count = await recoverOrphanUnsubmittedTasks();
    if (count > 0) {
      console.log(`→ [任务自愈] 已自动终止 ${count} 个未提交或超时未完成的生成任务`);
    }
  } catch (err) {
    console.error('[API] 任务自愈失败:', err);
  }
  try {
    const receipts = await purgeExpiredSubmissionReceipts();
    if (receipts > 0) console.log(`→ [提交收据] 已清理 ${receipts} 个过期收据`);
  } catch (err) {
    console.error('[API] 清理提交收据失败:', err);
  }
  try {
    const reviews = await purgeExpiredMediaReviews();
    if (reviews > 0) console.log(`→ [媒体审查] 已清理 ${reviews} 个过期待核记录`);
  } catch (err) {
    console.error('[API] 清理媒体审查队列失败:', err);
  }
}

export async function runPeriodicMaintenance(): Promise<void> {
  try {
    const count = await recoverOrphanUnsubmittedTasks();
    if (count > 0) {
      console.log(`→ [任务自愈] 周期扫描已终止 ${count} 个超时未完成的生成任务`);
    }
  } catch (err) {
    console.error('[API] 周期任务自愈失败:', err);
  }
  await checkpointDatabase().catch((err) => {
    console.error('[API] 周期 checkpointDatabase 失败:', err);
  });
  await purgeExpiredSubmissionReceipts().catch((err) => {
    console.error('[API] 周期清理提交收据失败:', err);
  });
  await purgeExpiredMediaReviews().catch((err) => {
    console.error('[API] 周期清理媒体审查失败:', err);
  });
}

export function installShutdown(server: { close: () => void }, walInterval: ReturnType<typeof setInterval>): void {
  let shuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[API] 收到 ${signal}，开始优雅关闭...`);
    try {
      clearInterval(walInterval);
      await Promise.all([
        drainDepthVideoQueue(SHUTDOWN_DRAIN_MS),
        withTimeout(flushItemQueue(), SHUTDOWN_DRAIN_MS, 'shutdown flushItemQueue'),
      ]);
      await checkpointDatabase().catch((err) => {
        console.error('[API] shutdown checkpointDatabase 失败:', err);
      });
      server.close();
      console.log('[API] HTTP 服务已关闭');
    } catch (err) {
      console.error('[API] shutdown 异常:', err);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => { void handleShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void handleShutdown('SIGINT'); });
}
