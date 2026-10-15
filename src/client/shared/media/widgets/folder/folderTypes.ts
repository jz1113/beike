import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface FolderItem {
  title?: string;
  description?: string;
  image?: string;
  alt?: string;
  content?: ReactNode;
}

export type FolderEntry = FolderItem | string | number | ReactElement;

export interface FolderProps {
  count?: number;
  badgeSuffix?: string;
  interactive?: boolean;
  coverImage?: string;
  ariaLabel?: string;
  expandOnClick?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  items?: (FolderEntry | ReactNode)[];
  label?: string;
  mode?: 'flap' | 'book';
  variant?: 'solid' | 'glass' | 'matte';
  color?: string;
  paperColor?: string;
  tabPosition?: 'left' | 'center' | 'right';
  layout?: 'spread' | 'stack' | 'row';
  size?: number;
  openOn?: 'click' | 'hover';
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onItemClick?: (item: FolderEntry, index: number) => void;
  onItemDrop?: (item: FolderEntry, index: number, inside: boolean) => void;
  draggable?: boolean;
  zoomOnClick?: boolean;
  peek?: boolean;
  intro?: boolean;
  tilt?: number;
  bounce?: number;
  speed?: number;
  frost?: number;
  closeOnOutsideClick?: boolean;
  theme?: 'dark' | 'light';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export type Matrix = number[];
export type Rgb = number[];
export type Phase = 'open' | 'receive' | 'peek' | 'rest';

export interface Geometry {
  book: boolean;
  scale: number;
  w: number;
  h: number;
  tabH: number;
  r: number;
  shoulder: number;
  corners: number[];
  tabW: number;
  tabX: number;
  frontTop: number;
  frontH: number;
  docW: number;
  docH: number;
}

export interface Slot {
  x: number;
  y: number;
  z: number;
  r: number;
  ry: number;
  s: number;
}

export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export interface Target {
  texture: WebGLTexture | null;
  frame: WebGLFramebuffer | null;
}

export interface Pane {
  matrix: Matrix;
  width: number;
  height: number;
  radii: number[];
  spine: number;
  bleed: number;
  morph: number;
  insideTop: number[];
  insideBottom: number[];
  tabRatio: number;
  gutter: number[];
  bevel: number;
  strength: number;
  split: number;
  lens: number;
  frost: number;
  tint: number[];
  haze: number;
  dim: number;
  glint: number;
  shine: number;
  light: number[];
}

export interface Scene {
  dpr: number;
  depth: number;
  origin: number[];
  view: View;
  layers: { key: string; matrix: Matrix; width: number; height: number; alpha: number }[];
  glass: Pane;
}

export interface Renderer {
  upload: (key: string, source: HTMLCanvasElement) => void;
  prune: (keys: Set<string>) => void;
  render: (scene: Scene) => void;
  dispose: () => void;
}

export interface Spring {
  value: number;
  velocity: number;
}

export interface ItemState {
  x: Spring;
  y: Spring;
  z: Spring;
  r: Spring;
  ry: Spring;
  s: Spring;
  hover: Spring;
  mx: Spring;
  my: Spring;
  alpha: Spring;
  place: 'inside' | 'out';
  rank: number;
  layer: 'inside' | 'out' | 'drag' | 'focus';
  elevated: boolean;
  insertUntil: number;
  insertFrom: 'side' | 'top' | null;
  outX: number;
  outY: number;
  outR: number;
  outS: number;
  outOrder: number;
  localX: number;
  localY: number;
  fresh: boolean;
}

export interface DragState {
  index: number;
  id: number;
  clientX: number;
  clientY: number;
  downX: number;
  downY: number;
  grabX: number;
  grabY: number;
  scale: number;
  clip: Bounds | null;
  active: boolean;
  samples: number[][];
}

export interface EngineState {
  raf: number;
  last: number;
  ready: boolean;
  hovered: boolean;
  pressed: boolean;
  pointerX: number;
  pointerY: number;
  deskX: number;
  deskY: number;
  hoveredItem: number;
  phase: Phase;
  previous: Phase;
  changedAt: number;
  front: Spring;
  rx: Spring;
  ry: Spring;
  lift: Spring;
  squash: Spring;
  items: ItemState[];
  focus: number;
  drag: DragState | null;
  receiving: boolean;
  receiveUntil: number;
  suppressClick: boolean;
  dropCount: number;
  intro: { phase: 'wait' | 'run' | 'done'; start: number; opening: boolean };
  anchor: Spring;
  appear: number;
  content: { key: string; entries: FolderEntry[] | null; renderer: Renderer | null };
}

export interface Settings {
  open: boolean;
  layout: string;
  openOn: string;
  peek: boolean;
  intro: boolean;
  draggable: boolean;
  zoomOnClick: boolean;
  closeOnOutsideClick: boolean;
  onItemClick?: (item: FolderEntry, index: number) => void;
  onItemDrop?: (item: FolderEntry, index: number, inside: boolean) => void;
  tilt: number;
  bounce: number;
  speed: number;
  frost: number;
  count: number;
  entries: FolderEntry[];
  glass: boolean;
  light: boolean;
  tint: Rgb;
  insideTop: string;
  insideBottom: string;
  insideTone: number[][];
  content: string;
  depth: number;
  view: View;
  g: Geometry;
}

export interface Engine {
  wake: () => void;
  invalidate: () => void;
  consumeClick: () => boolean;
  interactive: (index: number) => boolean;
  select: (index: number) => void;
  blur: () => boolean;
}
