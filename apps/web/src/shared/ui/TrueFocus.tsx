import React, { useEffect, useRef, useState, useCallback } from 'react';
import './TrueFocus.css';

export interface TrueFocusProps {
  sentence?: string;
  separator?: string;
  manualMode?: boolean;
  blurAmount?: number;
  borderColor?: string;
  glowColor?: string;
  animationDuration?: number;
  pauseBetweenAnimations?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TrueFocus({
  sentence = '贝壳 云图',
  separator = ' ',
  manualMode = false,
  blurAmount = 4.5,
  borderColor = '#ff4627',
  glowColor = 'rgba(255, 70, 39, 0.6)',
  animationDuration = 0.5,
  pauseBetweenAnimations = 1,
  className = '',
  style = {},
}: TrueFocusProps) {
  const words = sentence.split(separator);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastActiveIndex, setLastActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [focusRect, setFocusRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // 自动轮播聚焦切换
  useEffect(() => {
    if (!manualMode && words.length > 1) {
      const interval = setInterval(
        () => {
          setCurrentIndex((prev) => (prev + 1) % words.length);
        },
        (animationDuration + pauseBetweenAnimations) * 1000,
      );
      return () => clearInterval(interval);
    }
  }, [manualMode, animationDuration, pauseBetweenAnimations, words.length]);

  // 计算当前聚焦项在父容器内的绝对坐标与尺寸
  const updateRect = useCallback(() => {
    if (currentIndex === null || currentIndex === -1) return;
    const activeEl = wordRefs.current[currentIndex];
    const containerEl = containerRef.current;
    if (!activeEl || !containerEl) return;

    const parentRect = containerEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    setFocusRect({
      x: activeRect.left - parentRect.left,
      y: activeRect.top - parentRect.top,
      width: activeRect.width,
      height: activeRect.height,
    });
  }, [currentIndex]);

  useEffect(() => {
    updateRect();
  }, [currentIndex, updateRect]);

  // 响应窗口尺寸缩放与字体载入
  useEffect(() => {
    window.addEventListener('resize', updateRect);
    if (document.fonts) {
      document.fonts.ready.then(updateRect);
    }
    return () => window.removeEventListener('resize', updateRect);
  }, [updateRect]);

  const handleMouseEnter = (index: number) => {
    if (manualMode) {
      setLastActiveIndex(index);
      setCurrentIndex(index);
    }
  };

  const handleMouseLeave = () => {
    if (manualMode && lastActiveIndex !== null) {
      setCurrentIndex(lastActiveIndex);
    }
  };

  return (
    <div
      className={`focus-container ${className}`}
      ref={containerRef}
      style={style}
    >
      {words.map((word, index) => {
        const isActive = index === currentIndex;
        return (
          <span
            key={`${word}-${index}`}
            ref={(el) => {
              wordRefs.current[index] = el;
            }}
            className={`focus-word ${manualMode ? 'manual' : ''} ${isActive ? 'active' : ''}`}
            style={{
              filter: isActive ? 'blur(0px)' : `blur(${blurAmount}px)`,
              opacity: isActive ? 1 : 0.45,
              '--border-color': borderColor,
              '--glow-color': glowColor,
              transition: `filter ${animationDuration}s cubic-bezier(0.25, 1, 0.5, 1), opacity ${animationDuration}s cubic-bezier(0.25, 1, 0.5, 1)`,
            } as React.CSSProperties}
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
          >
            {word}
          </span>
        );
      })}

      {/* 🌟 对焦框 (带有 4 个红橙色角标 corner 与动态位移) */}
      <div
        className="focus-frame"
        style={{
          transform: `translate3d(${focusRect.x}px, ${focusRect.y}px, 0)`,
          width: `${focusRect.width}px`,
          height: `${focusRect.height}px`,
          opacity: currentIndex >= 0 && focusRect.width > 0 ? 1 : 0,
          transition: `transform ${animationDuration}s cubic-bezier(0.25, 1, 0.5, 1), width ${animationDuration}s ease, height ${animationDuration}s ease, opacity ${animationDuration}s ease`,
          '--border-color': borderColor,
          '--glow-color': glowColor,
        } as React.CSSProperties}
      >
        <span className="corner top-left" />
        <span className="corner top-right" />
        <span className="corner bottom-left" />
        <span className="corner bottom-right" />
      </div>
    </div>
  );
}

export default TrueFocus;
