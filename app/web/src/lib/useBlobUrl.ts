import { useCallback, useEffect, useRef } from 'react';

export interface BlobUrlController {
  /** 创建 Blob URL 并登记到自动清理列表 */
  create: (blob: Blob) => string;
  /** 创建 Blob URL 并立即接管旧 URL（用于覆盖式更新场景，例如重抽帧） */
  replace: (oldUrl: string | null | undefined, blob: Blob) => string;
  /** 主动释放单个 URL */
  revoke: (url: string) => void;
  /** 释放本 hook 管理过的所有 URL */
  revokeAll: () => void;
  /** 当前管理的 URL 数量（用于调试） */
  size: () => number;
}

/**
 * 统一管理组件内通过 URL.createObjectURL 创建的 Blob URL，避免内存泄漏。
 * - 组件卸载时自动 revoke 所有登记过的 URL
 * - 提供 replace 工具，在重新抽取视频帧/缩略图时一次性释放旧 URL
 */
export function useBlobUrl(): BlobUrlController {
  const urlsRef = useRef<Set<string>>(new Set());

  const revoke = useCallback((url: string) => {
    if (!url) return;
    if (urlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      urlsRef.current.delete(url);
    } else if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const create = useCallback(
    (blob: Blob): string => {
      const url = URL.createObjectURL(blob);
      urlsRef.current.add(url);
      return url;
    },
    [],
  );

  const replace = useCallback(
    (oldUrl: string | null | undefined, blob: Blob): string => {
      if (oldUrl) revoke(oldUrl);
      return create(blob);
    },
    [create, revoke],
  );

  const revokeAll = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  }, []);

  const size = useCallback(() => urlsRef.current.size, []);

  useEffect(() => revokeAll, [revokeAll]);

  return { create, replace, revoke, revokeAll, size };
}
