import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/deleteTasks', () => ({
  deleteTasksFromServer: vi.fn(),
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      deleteGenerationPermanently: vi.fn(),
    }),
  },
}));

import { deleteTasksFromServer } from '@/lib/deleteTasks';
import { permanentDeleteGeneration } from '../permanentDeleteGeneration';

const mockDelete = vi.mocked(deleteTasksFromServer);

describe('permanentDeleteGeneration collectKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockResolvedValue({ ok: true, count: 1 });
  });

  it('does not send resultUrl when ids are present', async () => {
    await permanentDeleteGeneration({
      id: 'local-id',
      taskId: 'task-1',
      dbId: 'db-1',
      resultUrl: 'data:image/png;base64,hugepayload',
    });

    expect(mockDelete).toHaveBeenCalledWith(['local-id', 'task-1', 'db-1'], []);
  });

  it('sends short http url only when no ids exist', async () => {
    await permanentDeleteGeneration({
      resultUrl: 'https://cdn.example.com/image.jpg',
    });

    expect(mockDelete).toHaveBeenCalledWith([], ['https://cdn.example.com/image.jpg']);
  });
});
