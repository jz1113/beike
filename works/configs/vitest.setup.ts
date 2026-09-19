import 'fake-indexeddb/auto';
import { configureDomainRuntime } from '@beike/domain/runtime';

configureDomainRuntime({
  env: new Proxy({} as NodeJS.ProcessEnv, {
    get: (_target, key) => process.env[String(key)],
  }),
  storage: typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage,
  fetch: globalThis.fetch.bind(globalThis),
});
