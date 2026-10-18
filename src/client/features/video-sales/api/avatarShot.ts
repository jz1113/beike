import { apiFetch } from '@client/shared/api/apiClient';

interface AvatarTask {
  id: string;
  status: number;
  videoUrl?: string;
  error?: string;
  statusMsg?: string;
}

export async function renderSalesAvatarShot(input: {
  script: string;
  avatarId: string;
  voiceId: string;
  voiceModel?: string;
  driverModel?: string;
  voiceBaseUrl?: string;
  voiceApiKey?: string;
  driverBaseUrl?: string;
  driverApiKey?: string;
}): Promise<string> {
  const created = await apiFetch('/api/avatar/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '带货口播镜头',
      scriptContent: input.script,
      layout: 2,
      resolution: 3,
      frameRate: 2,
      exportFormat: 'mp4',
      avatarId: input.avatarId,
      avatarPosition: '0,0',
      avatarScale: 1,
      voiceId: input.voiceId,
      voiceSpeed: 1,
      voiceVolume: 1,
      bgType: 'color',
      bgColor: '#000000',
      subtitleEnabled: true,
      fontId: 'font_ali_yuanti',
      fontSize: 28,
      fontColor: '#FFFFFF',
      fontPosition: 'bottom',
      voiceModel: input.voiceModel,
      videoModel: input.driverModel,
      voiceBaseUrl: input.voiceBaseUrl,
      voiceApiKey: input.voiceApiKey,
      driverBaseUrl: input.driverBaseUrl,
      driverApiKey: input.driverApiKey,
      driveMode: 'photo',
    }),
  });
  const data = await created.json().catch(() => ({}));
  if (!created.ok || data.success === false || !data.task?.id) {
    throw new Error(data.error || '数字人口播镜头提交失败');
  }
  const taskId = String(data.task.id);
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const polled = await apiFetch(`/api/avatar/tasks/${taskId}`);
    const body = await polled.json().catch(() => ({}));
    const task = body.task as AvatarTask | undefined;
    if (task?.status === 1 && task.videoUrl) return task.videoUrl;
    if (task?.status === 2) throw new Error(task.error || task.statusMsg || '数字人口播失败');
  }
  throw new Error('数字人口播超时');
}

export async function firstAvatarAssets(): Promise<{ avatarId: string; voiceId: string } | null> {
  const [characters, voices] = await Promise.all([
    apiFetch('/api/avatar/characters').then((res) => res.json()).catch(() => ({})),
    apiFetch('/api/avatar/voices').then((res) => res.json()).catch(() => ({})),
  ]);
  const avatarId = characters.characters?.find((item: { status: number }) => item.status === 1)?.id;
  const voiceId = voices.voices?.find((item: { status: number }) => item.status === 1)?.id;
  if (!avatarId || !voiceId) return null;
  return { avatarId, voiceId };
}
