import { afterEach, expect, it, vi } from 'vitest';
import { loadPromptBarUploads, snapshotAgentDocuments } from './agentAttachments';
import { parseAgentAttachments } from '@client/shared/media/agentArtifact';
import { sanitizeTaskForStorage } from '@client/store/persist/generation';
import type { GenerationTask } from '@client/store/appStoreTypes';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('restores the complete document after upload registry IDs are lost on reload', async () => {
  const text = '正文'.repeat(6000);
  const { agentUrls } = await loadPromptBarUploads([new File([text], 'brief.txt')], true);
  const documents = snapshotAgentDocuments(agentUrls).map(item => ({ ...item, id: 'agent-file:restored' }));
  const task: GenerationTask = { id: 'agent-task-doc', title: '', prompt: '分析', model: 'chat', size: '-', quality: 'high',
    status: 'SUCCESS', progress: '100%', useReferenceImage: true, mediaType: 'agent', referenceImages: ['agent-file:restored'], agentDocuments: documents };
  const restored = JSON.parse(JSON.stringify(sanitizeTaskForStorage(task)));
  expect(parseAgentAttachments(restored)).toEqual([expect.objectContaining({ name: 'brief.txt', textSnippet: text })]);
});

it('rejects audio instead of creating a metadata-only attachment', async () => {
  await expect(loadPromptBarUploads([new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' })], true)).rejects.toThrow('暂不支持音频');
});
