import path from 'node:path';
import { isTestFile, walkSourceFiles } from '../quality/source-files.mjs';

const scopes = {
  all: ['apps/web/src', 'apps/api/src', 'packages', 'tools/scripts'],
  web: ['apps/web/src'], api: ['apps/api/src'],
  domain: ['packages/domain/src'], tooling: ['tools/scripts'],
};
/** Only source trees, not node_modules, fixtures in backups, or browser QA scripts. */
export function discoverTests(root, scope = 'all') {
  if (!Object.hasOwn(scopes, scope)) throw new Error(`Unknown test scope: ${scope}`);
  return scopes[scope].flatMap(directory => walkSourceFiles(path.join(root, directory)))
    .filter(isTestFile).map(file => path.relative(root, file).split(path.sep).join('/')).sort();
}
