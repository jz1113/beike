'use client';

import { type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '@/lib/downloadMedia';
import { isTauriDesktop } from '@/lib/desktopRuntime';

type ExternalLinkAnchorProps = {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

/** 桌面端通过 Tauri opener 打开外链；Web 端保留原生 <a target="_blank"> 跳转（兼容 iframe 嵌入） */
export function ExternalLinkAnchor({ href, children, className, title }: ExternalLinkAnchorProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauriDesktop()) return;
    e.preventDefault();
    void openExternalUrl(href);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
      title={title}
    >
      {children}
    </a>
  );
}
