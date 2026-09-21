import type { CSSProperties, ReactNode } from 'react';

export interface ThoughtLineProps {
  label?: string;
  doneLabel?: string;
  renderLabel?: (label: string, working: boolean) => ReactNode;
  glyph?: 'sparkle' | 'dot' | 'none' | ReactNode;
  steps?: string[];
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  color?: string;
  glyphColor?: string;
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  shimmer?: boolean;
  shimmerDuration?: number;
  settleDuration?: number;
  settleBlur?: number;
  working?: boolean;
  settleAfter?: number;
  elapsed?: number;
  showTimer?: boolean;
  onSettle?: (elapsed: number) => void;
  className?: string;
  style?: CSSProperties;
}

declare const ThoughtLine: (props: ThoughtLineProps) => ReactNode;

export default ThoughtLine;
