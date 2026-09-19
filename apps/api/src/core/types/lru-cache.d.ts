declare module 'lru-cache' {
  interface Options<K, V> {
    max?: number;
    maxAge?: number;
    length?: (value: V, key?: K) => number;
    dispose?: (key: K, value: V) => void;
    stale?: boolean;
    noDisposeOnSet?: boolean;
    updateAgeOnGet?: boolean;
  }

  export default class LRUCache<K, V> {
    constructor(options?: Options<K, V> | number);
    readonly max: number;
    readonly length: number;
    readonly itemCount: number;
    set(key: K, value: V, maxAge?: number): boolean;
    get(key: K): V | undefined;
    has(key: K): boolean;
    del(key: K): void;
    reset(): void;
    prune(): void;
  }
}
