import { useEffect } from 'react';
import { useAppStore, type GenerationTask } from '@client/store';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { restoreStoredAgentTask } from '../engine/restoreStoredAgentTask';
import type { TaskUpdater } from '../engine/generationTaskTypes';

export function useStoredAgentRecovery(tasks: GenerationTask[], ready: boolean, update: TaskUpdater) {
  const key = JSON.stringify(ready ? tasks.filter(task => (
    (task.mediaType === 'agent' || task.id.startsWith('agent-task-')) && isImageTaskActive(task.status) &&
    task.submissionRecoveryRequired && (task.agentTurn?.turnId || task.taskId)
  )).map(task => task.id) : []);
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    const cleanups = ids.map(id => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const recover = async () => {
        const task = useAppStore.getState().generationTasks.find(task => task.id === id);
        if (controller.signal.aborted || !task || !task.submissionRecoveryRequired || !isImageTaskActive(task.status)) return;
        try {
          if (await restoreStoredAgentTask(task, update, controller.signal)) return;
        } catch { if (controller.signal.aborted) return; }
        if (controller.signal.aborted) return;
        update(id, { failReason: '暂时无法核对原对话结果，正在重连；不会重复提交' }, { persist: false });
        timer = setTimeout(() => { void recover(); }, 15_000);
      };
      void recover();
      return () => { controller.abort(); clearTimeout(timer); };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [key, update]);
}
