export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'image' | 'video' | 'selection' | 'input' | null;
  mediaUrl?: string;
  mediaAlt?: string;
  selectedText?: string;
  inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
}

