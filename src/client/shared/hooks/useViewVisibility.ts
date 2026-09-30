import { createContext, useContext } from 'react';

export const ViewVisibilityContext = createContext(true);

/** Hidden keep-alive views retain their state but suspend foreground interactions. */
export function useViewVisibility() {
  return useContext(ViewVisibilityContext);
}
