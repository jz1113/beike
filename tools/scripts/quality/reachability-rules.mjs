import path from 'node:path';

const studioFrame = 'src/client/features/canvas/components/editor/StudioWorkspace.tsx';
const publicDir = 'src/client/public';

export function isCanvasRuntimeSource(source) {
  return source === studioFrame || (source.startsWith(publicDir + '/canvas-studio/') && /\.m?js$/.test(source));
}

export function canvasRuntimeDependencies(source, content) {
  if (source === studioFrame) {
    const base = /<base\b[^>]*?\shref=["']([^"']+)["']/i.exec(content)?.[1];
    if (!base?.startsWith('/')) throw new Error('Missing public base URL for canvas iframe');
    const scripts = content.matchAll(/<script\b[^>]*?\ssrc=["']([^"']+)["']/gi);
    return Array.from(scripts, ([, src]) => publicDir + new URL(src, 'http://localhost' + base).pathname);
  }

  const targets = new Set();
  const originalBundle = path.posix.basename(source).replace(/-[\w-]+(?=\.mjs$)/, '');
  for (const match of content.matchAll(/new URL\(\s*["']([^"']+\.m?js)["']\s*,\s*(?:import\.meta\.url|self\.location\.href)\s*,?\s*\)/g)) {
    // The ONNX bundles use their original (unhashed) name for a file: self-reference.
    // The HTTP branch uses import.meta.url. Other file: assets are real dependencies.
    const before = content.slice(Math.max(0, match.index - 100), match.index);
    if (match[1] === originalBundle &&
        /import\.meta\.url\??\.startsWith\(["']file:["']\)\s*\?\s*(?:new URL\(\s*)?$/.test(before)) continue;
    targets.add(path.posix.join(path.posix.dirname(source), match[1]));
  }
  return targets;
}

/** Follow the complete graph, including dependencies of unused export barrels. */
export function reachableModules(modules, roots) {
  const graph = new Map(modules.map((module) => [module.source, module]));
  const seen = new Set();
  const visit = (source) => {
    if (seen.has(source) || !graph.has(source)) return;
    seen.add(source);
    for (const dependency of graph.get(source).dependencies || []) visit(dependency.resolved);
  };
  for (const root of roots) visit(root);
  return seen;
}

export function unreachableBrowserModules(modules, roots) {
  const reachable = reachableModules(modules, roots);
  return modules.map((module) => module.source)
    .filter((source) => /^src\/(client|shared)\/.*\.[cm]?[jt]sx?$/.test(source))
    .filter((source) => !source.endsWith('.d.ts'))
    .filter((source) => !reachable.has(source))
    .sort();
}
