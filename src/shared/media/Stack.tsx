'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import './Stack.css';

export interface StackProps {
  randomRotation?: boolean;
  sensitivity?: number;
  cards?: (React.ReactNode | string)[];
  animationConfig?: { stiffness: number; damping: number };
  sendToBackOnClick?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  mobileClickOnly?: boolean;
  mobileBreakpoint?: number;
  className?: string;
  onTopCardChange?: (topIndex: number) => void;
}

export const Stack: React.FC<StackProps> = ({
  randomRotation = false,
  cards = [],
  sendToBackOnClick = false,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = true,
  className = '',
  onTopCardChange
}) => {
  const [isPaused, setIsPaused] = useState(false);

  // 🌟 性能大飞跃：每个批次仅截取前 3 张渲染叠卡，底部深层卡片完全隐藏，节省 70%+ DOM 与图片解码开销
  const effectiveCards = useMemo(() => {
    return cards.slice(0, 3);
  }, [cards]);

  const [stack, setStack] = useState(() => {
    return effectiveCards.map((content, index) => ({ id: index + 1, originalIndex: index, content }));
  });

  const cardsKey = useMemo(() => {
    return effectiveCards.map((c, i) => (typeof c === 'string' ? c : i)).join('|');
  }, [effectiveCards]);

  useEffect(() => {
    setStack(effectiveCards.map((content, index) => ({ id: index + 1, originalIndex: index, content })));
  }, [cardsKey]);

  const sendToBack = useCallback((id: number) => {
    setStack(prev => {
      const newStack = [...prev];
      const index = newStack.findIndex(card => card.id === id);
      if (index === -1) return prev;
      const [card] = newStack.splice(index, 1);
      newStack.unshift(card);
      if (newStack.length > 0) {
        onTopCardChange?.(newStack[newStack.length - 1].originalIndex);
      }
      return newStack;
    });
  }, [onTopCardChange]);

  const topCardIdRef = useRef<number | null>(null);
  topCardIdRef.current = stack.length > 0 ? stack[stack.length - 1].id : null;

  useEffect(() => {
    if (autoplay && stack.length > 1 && !isPaused) {
      const interval = setInterval(() => {
        const topCardId = topCardIdRef.current;
        if (topCardId != null) sendToBack(topCardId);
      }, autoplayDelay);

      return () => clearInterval(interval);
    }
  }, [autoplay, autoplayDelay, stack.length, isPaused, sendToBack]);

  if (!stack.length) return null;

  return (
    <div
      className={`stack-container select-none ${className}`.trim()}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
    >
      {stack.map((card, index) => {
        const offset = stack.length - index - 1;
        const rotateDeg = offset * 3.2;
        const scaleVal = 1 - offset * 0.04;
        const isTop = index === stack.length - 1;

        return (
          <div
            key={card.id}
            onClick={() => sendToBackOnClick && sendToBack(card.id)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: index + 1,
              transform: `rotate(${rotateDeg}deg) scale(${scaleVal})`,
              transformOrigin: '85% 85%',
              transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
              willChange: 'transform'
            }}
            className="w-full h-full rounded-2xl overflow-hidden shadow-md bg-white border border-slate-200/90"
          >
            {typeof card.content === 'string' ? (
              <img
                src={card.content}
                alt=""
                className="w-full h-full object-cover"
                loading={isTop ? 'eager' : 'lazy'}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && typeof card.content === 'string') {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(card.content);
                  }
                }}
              />
            ) : (
              card.content
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(Stack);

