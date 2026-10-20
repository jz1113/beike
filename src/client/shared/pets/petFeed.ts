import type { ReactNode } from 'react';

export interface PetFeedRegistration {
  enabled: boolean;
  phase: string;
  modelLabel: string;
  open: boolean;
  onFiles: (files: File[]) => void;
  onDragging: (dragging: boolean) => void;
  setOpen: (open: boolean) => void;
  panel: ReactNode;
}

let registration: PetFeedRegistration | null = null;
const listeners = new Set<() => void>();

export function getPetFeed() {
  return registration;
}

export function subscribePetFeed(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPetFeed(next: PetFeedRegistration | null) {
  registration = next;
  listeners.forEach((listener) => listener());
}
