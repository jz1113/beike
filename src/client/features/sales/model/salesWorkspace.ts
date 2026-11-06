export type SalesAssetSection = 'script' | 'persona' | 'scene' | 'sound';
export type SalesEditorView = 'summary' | 'storyboard' | 'delivery';

export interface SalesLibraryChoice {
  type: 'script' | 'persona' | 'scene' | 'voice' | 'bgm';
  id: string;
  title: string;
}

export type OpenSalesLibrary = (section?: SalesAssetSection) => void;
