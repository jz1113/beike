import type React from 'react';
import type { SubjectItem } from './promptBarConstants';

export type { SubjectItem };

export interface RichPromptInputProps {
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPasteFiles?: (files: File[]) => void;
  placeholder?: string;
  allSubjects: SubjectItem[];
  quickRefImages: string[];
  onTriggerAtMenu?: (pos: number, query?: string) => void;
  onCloseAtMenu?: () => void;
  variant?: 'default' | 'composer';
  expanded?: boolean;
  singleLine?: boolean;
}

export interface RichPromptInputRef {
  focus: () => void;
  getSelectionStart: () => number;
  insertMention: (subject: SubjectItem) => void;
  setCursorToEnd: () => void;
}
