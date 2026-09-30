import type { Dispatch, SetStateAction } from 'react';

export interface CollectorSinglePanelProps {
  singlePlatform: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';
  setSinglePlatform: (v: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social') => void;
  singleInput: string;
  setSingleInput: (v: string) => void;
  handleSingleCollect: () => void;
  isCollectingSingle: boolean;
  singleCollectedResult: any | null;
  selectedSingleImages: string[];
  setSelectedSingleImages: Dispatch<SetStateAction<string[]>>;
  selectedVideo: boolean;
  setSelectedVideo: Dispatch<SetStateAction<boolean>>;
  singleImageFilter: 'all' | 'main' | 'sku' | 'desc' | 'video';
  setSingleImageFilter: (v: 'all' | 'main' | 'sku' | 'desc' | 'video') => void;
  aiAssistantPrompt: string;
  setAiAssistantPrompt: (v: string) => void;
  isDownloadingVideo: boolean;
  isDownloadingZip: boolean;
  setPreviewImageUrl: (v: string | null) => void;
  onExtractStyle: (images: string[], title?: string) => void;
  handleDownloadSingleVideo: (item: any) => void;
  handleDownloadSingleZip: (item: any) => void;
  handleImportToWorkshop: (item: any) => void;
  handleImportToAIAssistant: (item: any, prompt?: string, images?: string[], includeVideo?: boolean) => void;
}
