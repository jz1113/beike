import { useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '@client/store';
import { setPetFeed } from '@client/shared/pets/petFeed';
import { usePetPreferences } from '@client/shared/pets/petPreferences';

interface Input {
  coverModalOpen: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  phase: string;
  modelLabel: string;
  onFiles: (files: File[]) => void;
  onDragging: (dragging: boolean) => void;
  panel: ReactNode;
}

export function useCoverPetLink({ coverModalOpen, open, setOpen, phase, modelLabel, onFiles, onDragging, panel }: Input) {
  const currentView = useAppStore((state) => state.currentView);
  const preferences = usePetPreferences();
  const pageActive = currentView === 'headline_poster' && !coverModalOpen;
  const attached = pageActive && preferences.visible && preferences.petId !== 'none';
  const panelRef = useRef(panel);
  panelRef.current = panel;
  useEffect(() => {
    if (!pageActive) setOpen(false);
  }, [pageActive, setOpen]);
  useEffect(() => {
    setPetFeed({ enabled: attached, phase, modelLabel, open, onFiles, onDragging, setOpen, panel: panelRef.current });
  }, [attached, modelLabel, onDragging, onFiles, open, panel, phase, setOpen]);
  useEffect(() => () => setPetFeed(null), []);
  return { fallback: pageActive && !attached };
}
