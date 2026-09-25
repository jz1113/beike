import { isBuiltin } from 'node:module';

const inTree = (file, directory) => file.startsWith(`${directory}/`);
const isPackage = (specifier, name) => specifier === name || specifier.startsWith(`${name}/`);
export function featureOf(file) {
  return /^apps\/web\/src\/features\/([^/]+)\//.exec(file)?.[1] || null;
}

/** File topology rules; applied equally to imports, exports and literal lazy imports. */
export function boundaryViolations(from, to, specifier, allowed = new Set()) {
  const errors = [];
  const web = inTree(from, 'apps/web/src');
  const domain = inTree(from, 'packages/domain/src');
  const contracts = inTree(from, 'packages/contracts/src');
  const serverOnly = inTree(to, 'apps/api') || inTree(to, 'packages/server-kit') || inTree(to, 'packages/prisma')
    || ['@beike/server-kit', '@beike/prisma', '@prisma/client', 'sharp', '@aws-sdk/client-s3'].some(name => isPackage(specifier, name));
  if ((web || domain || contracts) && (isBuiltin(specifier) || serverOnly)) errors.push('browser-safe');
  if (inTree(from, 'packages') && inTree(to, 'apps')) errors.push('packages-no-apps');
  if (domain && inTree(to, 'packages') && !inTree(to, 'packages/domain')) errors.push('domain-is-independent');
  if (contracts && inTree(to, 'packages') && !inTree(to, 'packages/contracts')) errors.push('contracts-stay-thin');
  if (inTree(from, 'apps/api') && inTree(to, 'apps/web')) errors.push('api-no-web');
  if (inTree(from, 'apps/web/src/shared') && inTree(to, 'apps/web/src/features')) errors.push('shared-no-features');
  if (/^apps\/api\/src\/(routes|services)\//.test(from)
    && (to.endsWith('/repositories/db.ts') || /packages\/server-kit\/.*prisma/.test(to)
      || isPackage(specifier, '@prisma/client'))) errors.push('prisma-through-repositories');
  if (/^apps\/web\/src\/features\/workshop\/model\//.test(from)
    && (/^apps\/web\/src\/features\/workshop\/(hooks|components|views)\//.test(to))) errors.push('workshop-model-no-ui');
  const sourceFeature = featureOf(from), targetFeature = featureOf(to);
  if (sourceFeature && targetFeature && sourceFeature !== targetFeature && !allowed.has(`${sourceFeature}->${targetFeature}`)) {
    errors.push(`cross-feature:${sourceFeature}->${targetFeature}`);
  }
  return errors;
}
