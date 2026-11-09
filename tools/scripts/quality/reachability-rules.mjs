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

/** Product UI, hooks and operational adapters need real application consumers. */
export function testOnlyProductModules(modules, roots) {
  const production = reachableModules(modules, roots);
  return modules.map(({ source }) => source)
    .filter(source => /^src\/client\/features\//.test(source) || /^src\/shared\/domain\/(?:models\/model-adapters|assistant\/tools)\//.test(source))
    .filter(source => /\.[cm]?[jt]sx?$/.test(source) && !/\.(?:test|test-support|d)\.[cm]?[jt]sx?$/.test(source))
    .filter(source => source.startsWith('src/shared/') || /\/(?:components|hooks)\//.test(source) || /\.tsx$/.test(source))
    .filter(source => !production.has(source))
    .sort();
}
