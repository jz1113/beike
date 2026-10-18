import { apiFetch } from '@client/shared/api/apiClient';
import type {
  AvatarCharacter,
  AvatarVoice,
  AvatarFont,
  AvatarVideoTask,
  RenderAvatarVideoPayload,
  CreateAvatarCharacterPayload,
  CreateAvatarVoicePayload,
} from '@shared/contracts';

async function readAvatar(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : `请求失败 (${res.status})`);
  }
  return data;
}

export async function fetchAvatarCharacters(): Promise<AvatarCharacter[]> {
  const data = await readAvatar(await apiFetch('/api/avatar/characters'));
  return data.characters || [];
}

export async function createAvatarCharacter(payload: CreateAvatarCharacterPayload): Promise<AvatarCharacter> {
  const res = await apiFetch('/api/avatar/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readAvatar(res);
  return data.character;
}

export async function deleteAvatarCharacter(id: string): Promise<void> {
  await readAvatar(await apiFetch(`/api/avatar/characters/${id}`, { method: 'DELETE' }));
}

export async function fetchAvatarVoices(): Promise<AvatarVoice[]> {
  const data = await readAvatar(await apiFetch('/api/avatar/voices'));
  return data.voices || [];
}

export async function createAvatarVoice(payload: CreateAvatarVoicePayload): Promise<AvatarVoice> {
  const res = await apiFetch('/api/avatar/voices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readAvatar(res);
  return data.voice;
}

export async function deleteAvatarVoice(id: string): Promise<void> {
  await readAvatar(await apiFetch(`/api/avatar/voices/${id}`, { method: 'DELETE' }));
}

export async function fetchAvatarFonts(): Promise<AvatarFont[]> {
  const data = await readAvatar(await apiFetch('/api/avatar/fonts'));
  return data.fonts || [];
}

export async function fetchAvatarTasks(): Promise<AvatarVideoTask[]> {
  const data = await readAvatar(await apiFetch('/api/avatar/tasks'));
  return data.tasks || [];
}

export async function fetchAvatarTask(id: string): Promise<AvatarVideoTask> {
  const data = await readAvatar(await apiFetch(`/api/avatar/tasks/${id}`));
  return data.task;
}

export async function renderAvatarVideo(payload: RenderAvatarVideoPayload): Promise<AvatarVideoTask> {
  const res = await apiFetch('/api/avatar/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readAvatar(res);
  if (!data.task?.id) throw new Error('口播任务创建失败');
  return data.task;
}

export async function deleteAvatarTask(id: string): Promise<void> {
  await readAvatar(await apiFetch(`/api/avatar/tasks/${id}`, { method: 'DELETE' }));
}
