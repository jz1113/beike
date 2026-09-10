import { type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '@/lib/downloadMedia';

type ExternalLinkAnchorProps = {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

/** 桌面原生外链跳转（唤起系统默认浏览器） */
export function ExternalLinkAnchor({ href, children, className, title }: ExternalLinkAnchorProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    void openExternalUrl(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      title={title}
    >
      {children}
    </a>
  );
}
