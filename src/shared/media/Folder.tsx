'use client';

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
  title?: string;
  count?: number;
  className?: string;
  onClick?: () => void;
  onItemClick?: (index: number) => void;
}

export const Folder: React.FC<FolderProps> = ({
  color = '#4F46E5',
  size = 1,
  items = [],
  coverImage,
  title,
  count,
  className = '',
  onClick,
  onItemClick
}) => {
  const maxItems = 3;
  const papers = items.slice(0, maxItems);
  while (papers.length < maxItems) {
    papers.push(coverImage || null);
  }

  const [open, setOpen] = useState(false);
  const [paperOffsets, setPaperOffsets] = useState(
    Array.from({ length: maxItems }, () => ({ x: 0, y: 0 }))
  );

  const folderBackColor = darkenColor(color, 0.12);
  const paper1 = darkenColor('#ffffff', 0.1);
  const paper2 = darkenColor('#ffffff', 0.05);
  const paper3 = '#ffffff';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(prev => !prev);
    if (open) {
      setPaperOffsets(Array.from({ length: maxItems }, () => ({ x: 0, y: 0 })));
    }
    onClick?.();
  };

  const handlePaperMouseMove = (e: React.MouseEvent, index: number) => {
    if (!open) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = (e.clientX - centerX) * 0.15;
    const offsetY = (e.clientY - centerY) * 0.15;
    setPaperOffsets(prev => {
      const newOffsets = [...prev];
      newOffsets[index] = { x: offsetX, y: offsetY };
      return newOffsets;
    });
  };

  const handlePaperMouseLeave = (e: React.MouseEvent, index: number) => {
    setPaperOffsets(prev => {
      const newOffsets = [...prev];
      newOffsets[index] = { x: 0, y: 0 };
      return newOffsets;
    });
  };

  const folderStyle = {
    '--folder-color': color,
    '--folder-back-color': folderBackColor,
    '--paper-1': paper1,
    '--paper-2': paper2,
    '--paper-3': paper3
  } as React.CSSProperties;

  const folderClassName = `folder ${open ? 'open' : ''}`.trim();
  const scaleStyle = { transform: `scale(${size})`, transformOrigin: 'center center' };

  return (
    <div style={scaleStyle} className={`inline-flex flex-col items-center ${className}`.trim()}>
      <div
        className={folderClassName}
        style={folderStyle}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as any);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={open ? 'Close folder' : 'Open folder'}
      >
        <div className="folder__back">
          {papers.map((item, i) => (
            <div
              key={i}
              className={`paper paper-${i + 1}`}
              onMouseMove={e => handlePaperMouseMove(e, i)}
              onMouseLeave={e => handlePaperMouseLeave(e, i)}
              onClick={(e) => {
                if (open) {
                  e.stopPropagation();
                  onItemClick?.(i);
                }
              }}
              style={
                open
                  ? ({
                      transform: `translate(calc(-50% + ${paperOffsets[i]?.x || 0}px), calc(10% + ${paperOffsets[i]?.y || 0}px))`
                    } as any)
                  : {}
              }
            >
              {typeof item === 'string' ? (
                <img src={item} alt="" className="w-full h-full object-cover" />
              ) : (
                item
              )}
            </div>
          ))}
          <div className="folder__front">
            {coverImage && (
              <div className="absolute inset-1.5 rounded-[4px] overflow-hidden opacity-30 pointer-events-none">
                <img src={coverImage} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            {count !== undefined && (
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold font-mono">
                {count}P
              </div>
            )}
          </div>
          <div className="folder__front right"></div>
        </div>
      </div>
      {title && (
        <span className="mt-2 text-xs font-bold text-slate-800 text-center max-w-[140px] truncate">
          {title}
        </span>
      )}
    </div>
  );
};

export default Folder;
