import { isBuiltin } from 'node:module';

const inTree = (file, directory) => file.startsWith(`${directory}/`);
const isPackage = (specifier, name) => specifier === name || specifier.startsWith(`${name}/`);
export function featureOf(file) {
  return /^src\/client\/features\/([^/]+)\//.exec(file)?.[1] || null;
}

/** File topology rules; applied equally to imports, exports and literal lazy imports. */
export function boundaryViolations(from, to, specifier, allowed = new Set()) {
  const errors = [];
  const web = inTree(from, 'src/client');
  const domain = inTree(from, 'src/shared/domain');
  const contracts = inTree(from, 'src/shared/contracts');
  const serverOnly = inTree(to, 'src/server') || inTree(to, 'database')
    || ['@server', '@prisma/client', 'sharp', '@aws-sdk/client-s3'].some(name => isPackage(specifier, name));
  if ((web || domain || contracts) && (isBuiltin(specifier) || serverOnly)) errors.push('browser-safe');
  if (inTree(from, 'src/shared') && (inTree(to, 'src/client') || inTree(to, 'src/server'))) errors.push('shared-no-runtime');
  if (inTree(from, 'src/server/infrastructure') && inTree(to, 'src/server') && !inTree(to, 'src/server/infrastructure')) errors.push('infrastructure-no-application');
  if (inTree(from, 'src/server/repositories') && inTree(to, 'src/server/services')) errors.push('repositories-no-services');
  if ((inTree(from, 'src/server/routes') || inTree(from, 'src/server/services'))
    && (to === 'src/server/repositories/access.ts' || to === 'src/server/repositories/db.ts')) errors.push('application-no-direct-db');
  if (domain && inTree(to, 'src/shared') && !inTree(to, 'src/shared/domain')) errors.push('domain-is-independent');
  if (contracts && inTree(to, 'src/shared') && !inTree(to, 'src/shared/contracts')) errors.push('contracts-stay-thin');
  if (inTree(from, 'src/server') && inTree(to, 'src/client')) errors.push('api-no-web');
  if (inTree(from, 'src/client/shared') && inTree(to, 'src/client/features')) errors.push('shared-no-features');
  if (/^src\/server\/(routes|services)\//.test(from)
    && (to.endsWith('/repositories/db.ts') || /src\/server\/infrastructure\/.*prisma/.test(to)
      || isPackage(specifier, '@prisma/client'))) errors.push('prisma-through-repositories');
  if (/^src\/client\/features\/workshop\/model\//.test(from)
    && (/^src\/client\/features\/workshop\/(hooks|components|views)\//.test(to))) errors.push('workshop-model-no-ui');
  const sourceFeature = featureOf(from), targetFeature = featureOf(to);
  if (sourceFeature && targetFeature && sourceFeature !== targetFeature && !allowed.has(`${sourceFeature}->${targetFeature}`)) {
    errors.push(`cross-feature:${sourceFeature}->${targetFeature}`);
  }
  return errors;
}
