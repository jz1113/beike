import type { ChatSession, GenerationTask } from '../appStoreTypes';

export interface DrawingSnapshot {
  sessions: ChatSession[];
  tasks: GenerationTask[];
  currentId: string;
  updatedAt: number;
}
