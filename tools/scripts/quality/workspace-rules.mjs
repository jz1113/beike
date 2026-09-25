/** The six workspaces are build/runtime boundaries, not one package per feature. */
export const workspaces = {
  'apps/web': { name: '@beike/web', dependencies: ['@beike/contracts', '@beike/domain'] },
  'apps/api': { name: '@beike/api', dependencies: ['@beike/contracts', '@beike/domain', '@beike/server-kit', '@beike/prisma'] },
  'packages/contracts': { name: '@beike/contracts', dependencies: [] },
  'packages/domain': { name: '@beike/domain', dependencies: [] },
  'packages/server-kit': { name: '@beike/server-kit', dependencies: ['@beike/domain', '@beike/prisma'] },
  'packages/prisma': { name: '@beike/prisma', dependencies: [] },
};
export function workspaceManifestErrors(directory, manifest) {
  const policy = workspaces[directory], errors = [];
  if (!policy) return [`Unrecognized workspace: ${directory}`];
  if (manifest.name !== policy.name) errors.push(`Expected package name ${policy.name}`);
  if (manifest.private !== true) errors.push('Application workspace packages must be private');
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(manifest[section] || {})) {
      if (!name.startsWith('@beike/')) continue;
      if (!policy.dependencies.includes(name)) errors.push(`Forbidden dependency: ${name}`);
      if (range !== 'workspace:*') errors.push(`Internal dependency must use workspace:*: ${name}`);
    }
  }
  return errors;
}
