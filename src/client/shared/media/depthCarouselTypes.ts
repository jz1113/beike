export interface DepthCarouselItem {
  image: string;
  alt?: string;
  title?: string;
  [key: string]: any;
}

export interface DepthCarouselProps {
  items?: (DepthCarouselItem | string)[];
  cardWidth?: number;
  cardHeight?: number;
  radius?: number;
  tint?: string;
  depth?: number;
  spread?: number;
  tilt?: number;
  tiltDirection?: 'left' | 'right';
  perspective?: number;
  visibleCards?: number;
  falloff?: number;
  blur?: number;
  duration?: number;
  ease?: string;
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  showControls?: boolean;
  showIndicators?: boolean;
  onChange?: (index: number, item: DepthCarouselItem) => void;
  onItemClick?: (index: number, item: DepthCarouselItem) => void;
  className?: string;
}

