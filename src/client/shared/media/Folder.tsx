
import React, { useState } from 'react';
import './Folder.css';

const darkenColor = (hex: string, percent: number) => {
  let color = hex.startsWith('#') ? hex.slice(1) : hex;
  if (color.length === 3) {
    color = color
      .split('')
      .map(c => c + c)
      .join('');
  }
  const num = parseInt(color.slice(0, 6), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

export interface FolderProps {
  color?: string;
  size?: number;
  items?: (React.ReactNode | string)[];
  coverImage?: string;
  count?: number;
  badgeSuffix?: string;
  className?: string;
  ariaLabel?: string;
  onClick?: (event: React.MouseEvent) => void;
  onItemClick?: (index: number) => void;
  expandOnClick?: boolean;
  interactive?: boolean;
}

export const Folder: React.FC<FolderProps> = ({
  color = '#4F46E5',
  size = 1,
  items = [],
  coverImage,
  count,
  badgeSuffix = 'P',
  className = '',
  ariaLabel,
  onClick,
  onItemClick,
  expandOnClick = false,
  interactive = true,
}) => {
  const maxItems = 3;
  const papers = items.slice(0, maxItems);
  while (papers.length < maxItems) {
    papers.push(coverImage || null);
  }

  const [open, setOpen] = useState(false);

  const folderBackColor = darkenColor(color, 0.15);
  const paper1 = '#E2E8F0';
  const paper2 = '#F1F5F9';
  const paper3 = '#FFFFFF';

  const handleClick = (e: React.MouseEvent) => {
    if (expandOnClick) {
      e.stopPropagation();
      setOpen(prev => !prev);
    }
    if (onClick) {
      e.stopPropagation();
      onClick(e);
    }
  };

  const folderStyle = {
    '--folder-color': color,
    '--folder-back-color': folderBackColor,
    '--paper-1': paper1,
    '--paper-2': paper2,
    '--paper-3': paper3,
  } as React.CSSProperties;

  const folderClassName = `folder ${open ? 'open' : ''}`.trim();
  const scaleStyle = { transform: `scale(${size}) translateZ(0)`, transformOrigin: 'center center' };

  return (
    <div style={scaleStyle} className={`inline-flex flex-col items-center select-none ${className}`.trim()}>
      <div
        className={folderClassName}
        style={folderStyle}
        onClick={interactive ? handleClick : undefined}
        onKeyDown={e => {
          if (interactive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? 'button' : undefined}
        aria-expanded={interactive && expandOnClick ? open : undefined}
        aria-label={interactive ? ariaLabel || (open ? '收起文件夹' : '打开文件夹') : undefined}
      >
        <div className="folder__back">
          {papers.map((item, i) => (
            <div
              key={i}
              className={`paper paper-${i + 1}`}
              onClick={(e) => {
                if (open) {
                  e.stopPropagation();
                  onItemClick?.(i);
                }
              }}
            >
              {typeof item === 'string' && item ? (
                <img
                  src={item}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover rounded-[7px] pointer-events-none select-none"
                />
              ) : (
                item
              )}
            </div>
          ))}
          <div className="folder__front">
            {count !== undefined && (
              <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold font-mono shadow-xs">
                {count}{badgeSuffix || 'P'}
              </div>
            )}
          </div>
          <div className="folder__front right"></div>
        </div>
      </div>
    </div>
  );
};

export const MemoizedFolder = React.memo(Folder);
export default MemoizedFolder;
