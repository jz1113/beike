import path from 'node:path';
import { loadAppDataEnv, resolveDatabaseFile } from '../web/web-shared.mjs';

/** Explicit paths/URLs override the app data directory; never guess a legacy database. */
export function resolveSqliteFile(fromArg) {
  if (fromArg) return path.resolve(fromArg);
  loadAppDataEnv();
  return resolveDatabaseFile();
}
