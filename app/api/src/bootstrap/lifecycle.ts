import { checkpointDatabase } from '@beike/server-kit/prisma';
import { recoverOrphanUnsubmittedTasks } from '../services/taskRecovery';

export async function recoverOnBoot(): Promise<void> {
  await checkpointDatabase().catch(() => {});
  try {
    const count = await recoverOrphanUnsubmittedTasks();
    if (count > 0) {
      console.log(`→ [任务自愈] 已自动重置 ${count} 个未提交云端的孤儿任务为 FAILURE`);
    }
  } catch {
    /* ignore */
  }
}

export function installShutdown(server: { close: () => void }, walInterval: ReturnType<typeof setInterval>): void {
  const handleShutdown = async (signal: string) => {
    console.log(`[API] 收到 ${signal}，开始优雅关闭...`);
    try {
      clearInterval(walInterval);
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
