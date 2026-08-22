'use client';

import { type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '@/lib/downloadMedia';

type ExternalLinkAnchorProps = {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

/** 桌面端通过 Tauri opener 打开外链，Web 端走 window.open */
export function ExternalLinkAnchor({ href, children, className, title }: ExternalLinkAnchorProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    void openExternalUrl(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className} title={title} rel="noreferrer">
      {children}
    </a>
  );
}
