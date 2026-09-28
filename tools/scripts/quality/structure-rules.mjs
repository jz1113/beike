import { isBuiltin } from 'node:module';

export function manifestErrors(manifest) {
  const errors = [];
  if (manifest.private !== true) errors.push('Project must be private');
  if ('workspaces' in manifest) errors.push('Use one root manifest, not workspaces');
  for (const entries of [manifest.dependencies, manifest.devDependencies]) {
    for (const [name, range] of Object.entries(entries || {})) {
      if (/^@(beike|client|server|shared)\//.test(name) || /^(workspace:|link:|file:)/.test(range)) {
        errors.push(`Internal source must use aliases, not package dependencies: ${name}`);
      }
    }
  }
  return errors;
}

export function externalDependency(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || /^@(client|server|shared)\//.test(specifier) || isBuiltin(specifier)) return null;
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}
