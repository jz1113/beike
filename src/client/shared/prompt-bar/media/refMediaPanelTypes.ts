import type { RefObject } from 'react';
import type { RefMediaKind } from '@client/shared/api/mediaUpload';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import type { SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';

export interface RefMediaLightboxState {
  items: string[];
  currentIndex: number;
}

export interface PromptBarRefMediaPanelProps {
  layout?: 'sidebar' | 'strip';
  frameExpanded?: boolean;
  quickGenMode: QuickGenMode;
  quickVideoRefMode: string;
  quickVideoFirstFrame: string | null;
  quickVideoLastFrame: string | null;
  quickVideoMultiFrames: string[];
  quickRefImages: string[];
  isExpandedRefImages: boolean;
  setIsExpandedRefImages: (v: boolean) => void;
  setQuickVideoFirstFrame: (v: string | null) => void;
  setQuickVideoLastFrame: (v: string | null) => void;
  swapVideoFirstLastFrames: () => void;
  removeQuickVideoMultiFrame: (idx: number) => void;
  removeQuickRefImage: (idx: number) => void;
  onUploadClick: () => void;
  onFirstFrameClick: () => void;
  onLastFrameClick: () => void;
  onMultiFrameClick: () => void;
  refImagesContainerRef: RefObject<HTMLDivElement | null>;
  onMouseEnterRefImages: () => void;
  onMouseLeaveRefImages: () => void;
  resolveMediaFile?: (url: string) => File | undefined;
  resolveMediaKind?: (url: string) => RefMediaKind | undefined;
  allSubjects?: SubjectItem[];
  onSelectSubject?: (subject: SubjectItem) => void;
  onClearAll?: () => void;
}

