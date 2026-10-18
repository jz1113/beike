import { deconstructCoverSample } from '../api/posterApi';
import type { CoverDeconstruction, CoverMemoryCase } from './coverSkillTypes';
import { saveMemoryCase } from './coverMemoryStorage';

export interface DeconstructTask {
  id: string;
  title: string;
  imageUrls: string[];
  model: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  retryCount: number;
  result?: CoverDeconstruction;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

type QueueListener = (tasks: DeconstructTask[]) => void;

class DeconstructQueueService {
  private tasks: DeconstructTask[] = [];
  private listeners: Set<QueueListener> = new Set();
  private isProcessing = false;
  private readonly maxRetries = 3;

  constructor() {
    this.loadPersistedTasks();
  }

  private loadPersistedTasks() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('beike:cover-deconstruct-queue:v1');
      if (raw) {
        const list: DeconstructTask[] = JSON.parse(raw);
        // 重置正在运行的状态为 pending
        this.tasks = list.map((t) => (t.status === 'running' ? { ...t, status: 'pending' } : t));
      }
    } catch {
      this.tasks = [];
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('beike:cover-deconstruct-queue:v1', JSON.stringify(this.tasks.slice(0, 50)));
    } catch (err) {
      console.error('Failed to persist deconstruct queue', err);
    }
  }

  private notify() {
    this.persist();
    for (const listener of this.listeners) {
      try {
        listener([...this.tasks]);
      } catch (err) {
        console.error('Queue listener error', err);
      }
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.tasks]);
    return () => this.listeners.delete(listener);
  }

  public getTasks(): DeconstructTask[] {
    return [...this.tasks];
  }

  public getRunningCount(): number {
    return this.tasks.filter((t) => t.status === 'running' || t.status === 'pending').length;
  }

  public enqueue(imageUrls: string[], model = 'gemini-3.7-flash', title?: string): string {
    const id = 'dtask-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const task: DeconstructTask = {
      id,
      title: title || (imageUrls.length > 1 ? `群组样张 (${imageUrls.length} 张)` : '封面样张'),
      imageUrls,
      model,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    };
    this.tasks.unshift(task);
    this.notify();
    void this.processNext();
    return id;
  }

  public retry(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = 'pending';
    task.error = undefined;
    task.retryCount = 0;
    this.notify();
    void this.processNext();
  }

  public remove(taskId: string): void {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.notify();
  }

  public clearCompleted(): void {
    this.tasks = this.tasks.filter((t) => t.status !== 'completed');
    this.notify();
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    const nextTask = this.tasks.find((t) => t.status === 'pending');
    if (!nextTask) return;

    this.isProcessing = true;
    nextTask.status = 'running';
    this.notify();

    try {
      const result = await deconstructCoverSample(nextTask.imageUrls, nextTask.model);
      nextTask.status = 'completed';
      nextTask.result = result;
      nextTask.completedAt = Date.now();

      // 自动保存至案例记忆库
      const newCase: CoverMemoryCase = {
        id: 'case-' + Date.now(),
        imageUrl: nextTask.imageUrls[0],
        title: nextTask.title || result.summary.slice(0, 16) || '反推样本',
        tags: [result.layout.gridType, result.typography.titleFontFamily, result.colorPalette.contrastLevel].filter(Boolean),
        features: result,
        createdAt: Date.now(),
      };
      saveMemoryCase(newCase);
    } catch (err) {
      const message = err instanceof Error ? err.message : '反推失败';
      if (nextTask.retryCount < this.maxRetries) {
        nextTask.retryCount += 1;
        nextTask.status = 'pending';
        nextTask.error = `第 ${nextTask.retryCount} 次重试中 (${message})`;
        this.notify();
        // 指数退避等待 (1s, 3s, 8s)
        const delay = Math.pow(nextTask.retryCount, 2) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        nextTask.status = 'failed';
        nextTask.error = message;
      }
    } finally {
      this.isProcessing = false;
      this.notify();
      // 继续下一个任务
      void this.processNext();
    }
  }
}

export const deconstructQueue = new DeconstructQueueService();
