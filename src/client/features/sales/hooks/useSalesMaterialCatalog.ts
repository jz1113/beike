import { createContext, useContext } from 'react';
import type { SalesStudioAssetCatalog } from '../api/salesProduction';

export const SalesMaterialCatalogContext = createContext<{
  catalog: SalesStudioAssetCatalog; loading: boolean; error: string; refresh: () => void;
}>({ catalog: { personas: [], scenes: [], actions: [], voices: [], bgms: [] }, loading: false, error: '', refresh: () => {} });

export function useSalesMaterialCatalog() { return useContext(SalesMaterialCatalogContext); }
