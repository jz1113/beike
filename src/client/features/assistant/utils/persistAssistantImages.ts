import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { compressImageForSubmission } from '@client/shared/media/image-utils';
import { dataUrlToBlob } from '@client/shared/media/downloadMedia';
import type { MediaAttachment } from '@client/store/appStoreTypes';

/** Save images before the message is committed; a failed save leaves the draft available. */
export async function persistAssistantImages(attachments: MediaAttachment[], signal?: AbortSignal): Promise<MediaAttachment[]> {
  const saved = new Map<string, string>();
  const result: MediaAttachment[] = [];
  for (const attachment of attachments) {
    signal?.throwIfAborted();
    if (attachment.type === 'video' && /^(blob:|data:)/.test(attachment.url)) {
      const source = attachment.url.startsWith('data:') ? dataUrlToBlob(attachment.url) : await fetch(attachment.url, { signal }).then((response) => response.blob());
      if (source.size > 100_000_000) throw new Error('视频超过 100 MB，请压缩或截取片段后上传');
      const response = await apiFetch('/api/assistant/media', { method: 'POST', body: source, signal,
        headers: { 'Content-Type': attachment.mime || source.type || 'video/mp4' },
      });
      const body = await response.json();
      if (!response.ok || !body.success || !body.url) throw new Error(body.error || '对话视频保存失败，附件已保留');
      result.push({ ...attachment, url: body.url });
      continue;
    }
    if (attachment.type !== 'image' || /^\/storage\/assistant-attachments\//.test(attachment.url || '')) {
      result.push(attachment);
      continue;
    }
    let url = saved.get(attachment.url);
    if (!url) {
      if (!attachment.url) throw new Error('原参考图已丢失，请重新载入');
      let input: File | string = attachment.url;
      if (!/^(data:|blob:)/.test(attachment.url)) {
        const original = await fetch(proxyMediaUrl(attachment.url), { signal });
        if (!original.ok) throw new Error('无法读取参考图，请重新载入');
        input = new File([await original.blob()], attachment.name || 'reference');
      }
      const data = await compressImageForSubmission(input, 4_000_000);
      // Decode in memory: desktop CSP blocks fetch(data:) even though img-src allows it.
      const blob = dataUrlToBlob(data);
      let response: Response;
      try {
        response = await apiFetch('/api/assistant/media', { method: 'POST', body: blob, signal });
      } catch {
        signal?.throwIfAborted();
        throw new Error('参考图上传失败：无法连接本地服务。附件已保留，请稍后重试');
      }
      const body = await response.json().catch(() => {
        throw new Error(`参考图上传失败：服务返回异常（HTTP ${response.status}），附件已保留`);
      });
      if (!response.ok || !body.success || !body.url) throw new Error(body.error || '对话图片保存失败');
      url = body.url as string;
      saved.set(attachment.url, url);
    }
    result.push({ ...attachment, url, thumbnailUrl: url });
  }
  return result;
}
