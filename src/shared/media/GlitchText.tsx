'use client';

import React from 'react';
import './GlitchText.css';

export interface GlitchTextProps {
  children?: React.ReactNode;
  text?: string;
  speed?: number;
  enableShadows?: boolean;
  enableOnHover?: boolean;
  className?: string;
  style?: React.CSSProperties;
  afterShadow?: string;
  beforeShadow?: string;
  animColor?: string;
}

export const GlitchText: React.FC<GlitchTextProps> = ({
  children,
  text,
  speed = 1,
  enableShadows = true,
  enableOnHover = false,
  className = '',
  style = {},
  afterShadow,
  beforeShadow,
  animColor
}) => {
  const content = text || (typeof children === 'string' ? children : String(children || ''));

  const inlineStyles: React.CSSProperties = {
    ...style,
    ['--after-duration' as any]: `${speed * 3}s`,
    ['--before-duration' as any]: `${speed * 2}s`,
    ['--after-shadow' as any]: enableShadows ? (afterShadow || '-3px 0 #ef4444') : 'none',
    ['--before-shadow' as any]: enableShadows ? (beforeShadow || '3px 0 #06b6d4') : 'none',
    ['--glitch-anim-color' as any]: animColor || 'inherit',
  };

  const hoverClass = enableOnHover ? 'enable-on-hover' : '';

  return (
    <span
      className={`glitch ${hoverClass} ${className}`.trim()}
      style={inlineStyles}
      data-text={content}
    >
      {children || text}
    </span>
  );
};

export default GlitchText;
