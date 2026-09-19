export type DomainStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type DomainRuntime = {
  env?: Record<string, string | undefined>;
  storage?: DomainStorage | null;
  fetch?: typeof fetch;
};

let runtime: DomainRuntime = {};

export function configureDomainRuntime(next: DomainRuntime): void {
  runtime = { ...runtime, ...next };
}

export function domainEnv(name: string): string | undefined {
  return runtime.env?.[name];
}

export function domainStorage(): DomainStorage | null | undefined {
  return runtime.storage;
}

export function domainFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const fetchImpl = runtime.fetch;
  if (!fetchImpl) return Promise.reject(new Error('fetch is not configured'));
  return fetchImpl(input, init);
}
