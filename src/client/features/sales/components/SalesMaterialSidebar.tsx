import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const SalesMaterialSidebarContext = createContext<HTMLDivElement | null>(null);

/** Keep library filter state and lifecycle while rendering inside the asset navigation. */
export function SalesMaterialSidebar({ children }: { children: ReactNode }) {
  const target = useContext(SalesMaterialSidebarContext);
  return target ? createPortal(children, target) : <aside className="sales-reference-category-fallback">{children}</aside>;
}
