import path from 'node:path';
import { applyEnvFileToProcess } from '@server/infrastructure/config/desktopEnvFile';
import { configureDomainRuntime } from '@shared/domain/core/runtime';

export function loadApiEnv(): void {
  // The launcher owns process/data/auth identity; a config file cannot redirect it.
  const owned: Record<string, string | undefined> = process.env.BEIKE_WEB_LAUNCH === '1'
    ? Object.fromEntries(['PORT', 'HOSTNAME', 'AZHUO_DATA_DIR', 'DATABASE_URL', 'LOCAL_ACCESS_TOKEN',
      'NODE_ENV', 'WEB_DIST_DIR', 'PUBLIC_WEB_ORIGIN'].map(key => [key, process.env[key]])) : {};
  if (typeof (process as { loadEnvFile?: () => void }).loadEnvFile === 'function') {
    try {
      if (process.env.BEIKE_ISOLATED_DEV !== '1') (process as { loadEnvFile: () => void }).loadEnvFile();
    } catch {
      /* ignore missing .env */
    }
    const dataDir = owned.AZHUO_DATA_DIR ?? process.env.AZHUO_DATA_DIR;
    const dataDirEnv = dataDir ? path.join(dataDir, '.env') : null;
    if (dataDirEnv) applyEnvFileToProcess(dataDirEnv);
  }
  for (const [key, value] of Object.entries(owned)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
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
