import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import { createWorkshopSlice } from './workshopSlice';
import type { AppState } from './types';

// Only this slice is exercised; the other application slices are intentionally absent.
const makeStore = () => createStore<AppState>()((set, get, api) => ({ ...createWorkshopSlice(set, get, api) }) as AppState);

describe('workshop collected product import', () => {
  it('keeps SKU-only imports out of the main category', () => {
    const store = makeStore();
    const sku = 'https://cdn.example.com/sku.jpg';
    store.getState().setProductData(null, { main: [], skus: [sku], details: [sku] });
    expect(store.getState().images).toEqual([{ url: sku, type: 'sku', selected: false }]);
  });

  it('deduplicates normalized CDN variants across categories', () => {
    const store = makeStore();
    store.getState().setProductData(null, {
      main: ['https://img14.360buyimg.com/n5/s50x50_jfs/t1/a.jpg'],
      skus: ['https://img13.360buyimg.com/n1/jfs/t1/a.jpg'], details: ['jfs/t1/a.jpg'],
    });
    expect(store.getState().images).toEqual([{ url: 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.jpg', type: 'main', selected: false }]);
  });
});
