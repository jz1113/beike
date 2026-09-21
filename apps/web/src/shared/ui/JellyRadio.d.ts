import type { ReactNode } from 'react';

export interface JellyRadioItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface JellyRadioProps {
  items?: Array<string | JellyRadioItem>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  ariaLabel?: string;
  [option: string]: unknown;
}

declare const JellyRadio: (props: JellyRadioProps) => ReactNode;

export default JellyRadio;
