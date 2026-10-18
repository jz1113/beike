import React, { useRef, useState, useCallback, type ReactNode, type MouseEvent } from 'react';

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  onClick?: () => void;
  title?: string;
  role?: string;
  ariaLabel?: string;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor,
  onClick,
  title,
  role,
  ariaLabel,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      role={role}
      aria-label={ariaLabel}
      title={title}
      className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-all duration-300 hover:shadow-md dark:border-white/10 dark:bg-[#13161C] dark:shadow-none ${className}`}
    >
      {/* 聚光灯光晕层 (GPU 加速) */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${
            spotlightColor || 'rgba(99, 102, 241, 0.12)'
          }, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

export default SpotlightCard;
