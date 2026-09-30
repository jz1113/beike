import React, { useMemo } from 'react';
import DepthCarouselImage from './DepthCarouselImage';
import './DepthCarousel.css';

import type { DepthCarouselItem, DepthCarouselProps } from './depthCarouselTypes';
import { useDepthCarouselMotion } from './useDepthCarouselMotion';
export type { DepthCarouselItem, DepthCarouselProps } from './depthCarouselTypes';

const DEFAULT_ITEMS: DepthCarouselItem[] = [
  { image: '/inspirations/insp_1.jpg', alt: 'Slide 1' },
  { image: '/inspirations/insp_2.jpg', alt: 'Slide 2' },
  { image: '/inspirations/insp_3.jpg', alt: 'Slide 3' },
];

const normalizeItem = (it: DepthCarouselItem | string): DepthCarouselItem =>
  typeof it === 'string' ? { image: it, alt: '' } : it;

export const DepthCarousel: React.FC<DepthCarouselProps> = ({
  items = DEFAULT_ITEMS,
  cardWidth = 260,
  cardHeight = 340,
  radius = 18,
  tint = '#05060a',
  depth = 200,
  spread = 80,
  tilt = 20,
  tiltDirection = 'right',
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 0,
  duration = 700,
  ease = 'power3.out',
  autoplay = false,
  autoplayDelay = 3200,
  loop = true,
  showControls = true,
  showIndicators = true,
  onChange,
  onItemClick,
  className = '',
}) => {
  const data = useMemo(
    () => (Array.isArray(items) ? items : []).map(normalizeItem),
    [items]
  );
  const {
    count, active, rootRef, stageRef, cardRefs, overlayRefs, suppressClickRef,
    onPointerDown, onPointerMove, onPointerEnd, onKeyDown, onCardClick, navigateBy, setFocus,
  } = useDepthCarouselMotion(data, {
    depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, ease, loop,
    cardWidth, cardHeight, radius, autoplay, autoplayDelay, onChange, onItemClick,
  });

  return (
    <div
      ref={rootRef}
      className={`depth-carousel ${className}`.trim()}
      style={{ '--dc-perspective': `${perspective}px` } as React.CSSProperties}
      role="group"
      aria-roledescription="carousel"
      aria-label="图片轮播"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={event => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div className="depth-carousel__stage" ref={stageRef}>
        {data.map((item, i) => {
          let distance = Math.abs(i - active);
          if (loop && count > 1) distance = Math.min(distance, count - distance);
          return (
            <div
              key={`${i}-${item.image}-${item.rawUrl || ''}`}
              className="depth-carousel__card group/card"
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              style={{ width: cardWidth, height: cardHeight, borderRadius: radius }}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={active !== i}
              onClick={() => onCardClick(i)}
            >
              <DepthCarouselImage image={item.image} rawUrl={item.rawUrl} alt={item.alt} load={distance <= visibleCards + 1} />
              <span
                className="depth-carousel__tint"
                ref={(el) => {
                  overlayRefs.current[i] = el;
                }}
                style={{ background: tint }}
              />
              <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white/90 text-[10px] font-mono font-bold shadow-xs border border-white/10">
                #{i + 1}
              </div>
            </div>
          );
        })}
      </div>

      {showControls && count > 1 && (
        <>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--prev cursor-pointer group"
            aria-label="Previous slide"
            onClick={(e) => {
              e.stopPropagation();
              navigateBy(-1);
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--next cursor-pointer group"
            aria-label="Next slide"
            onClick={(e) => {
              e.stopPropagation();
              navigateBy(1);
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}

      {showIndicators && count > 1 && (
        <div className="depth-carousel__dots" role="tablist" aria-label="Slides">
          {data.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Go to slide ${i + 1}`}
              className={`depth-carousel__dot cursor-pointer${active === i ? ' is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setFocus(i, true);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DepthCarousel;
