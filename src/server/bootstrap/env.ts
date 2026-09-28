import path from 'node:path';
import { applyEnvFileToProcess } from '@server/infrastructure/config/desktopEnvFile';
import { configureDomainRuntime } from '@shared/domain/core/runtime';

export function loadApiEnv(): void {
  if (typeof (process as { loadEnvFile?: () => void }).loadEnvFile === 'function') {
    try {
      (process as { loadEnvFile: () => void }).loadEnvFile();
    } catch {
      /* ignore missing .env */
    }
    const dataDirEnv = process.env.AZHUO_DATA_DIR ? path.join(process.env.AZHUO_DATA_DIR, '.env') : null;
    if (dataDirEnv) applyEnvFileToProcess(dataDirEnv);
  }
  if (!process.env.LOCAL_ACCESS_TOKEN && process.env.NODE_ENV !== 'production') {
    process.env.LOCAL_ACCESS_TOKEN = 'azhuo-local-dev';
  }
  configureDomainRuntime({
    env: new Proxy({} as NodeJS.ProcessEnv, {
      get: (_target, key) => process.env[String(key)],
    }),
    fetch: globalThis.fetch.bind(globalThis),
  });
}
