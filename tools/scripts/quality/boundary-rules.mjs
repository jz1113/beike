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
  const serverOnly = inTree(to, 'database')
    || ['@server', '@prisma/client', 'sharp', '@aws-sdk/client-s3'].some(name => isPackage(specifier, name));
  if ((web || domain || contracts) && (isBuiltin(specifier) || serverOnly)) errors.push('browser-safe');
  if (inTree(from, 'src/shared') && inTree(to, 'src/client')) errors.push('shared-no-runtime');
  if (domain && inTree(to, 'src/shared') && !inTree(to, 'src/shared/domain')) errors.push('domain-is-independent');
  if (contracts && inTree(to, 'src/shared') && !inTree(to, 'src/shared/contracts')) errors.push('contracts-stay-thin');
  if (inTree(from, 'src/client/shared') && inTree(to, 'src/client/features')) errors.push('shared-no-features');
  const modelFeature = /^src\/client\/features\/([^/]+)\/model\//.exec(from)?.[1];
  if (modelFeature && /^src\/client\/features\/[^/]+\/(hooks|components|views)\//.test(to)) {
    errors.push('feature-model-no-ui');
  }
  if (/^src\/client\/features\/sales\/model\//.test(from) && !/\.test\.tsx?$/.test(from)
    && (/^src\/client\/features\/sales\/api\//.test(to) || /src\/client\/shared\/api\/apiClient/.test(to))) {
    errors.push('sales-model-no-api');
  }
  const sourceFeature = featureOf(from), targetFeature = featureOf(to);
  if (sourceFeature && targetFeature && sourceFeature !== targetFeature && !allowed.has(`${sourceFeature}->${targetFeature}`)) {
    errors.push(`cross-feature:${sourceFeature}->${targetFeature}`);
  }
  return errors;
}
