import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export interface WorkshopBatchDockActions {
  onCreate: () => void;
  onHistory: () => void;
  disabled: boolean;
}

interface WorkshopDockActionsContextValue {
  actions: WorkshopBatchDockActions | null;
  setActions: Dispatch<SetStateAction<WorkshopBatchDockActions | null>>;
}

const WorkshopDockActionsContext = createContext<WorkshopDockActionsContextValue | null>(null);

export function WorkshopDockActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<WorkshopBatchDockActions | null>(null);
  return <WorkshopDockActionsContext.Provider value={{ actions, setActions }}>
    {children}
  </WorkshopDockActionsContext.Provider>;
}

export function useWorkshopDockActions() {
  const context = useContext(WorkshopDockActionsContext);
  if (!context) throw new Error('Workshop dock actions require the workshop provider');
  return context;
}
