/**
 * Migrate app/shared + app/contracts → packages/{domain,server-kit,contracts}
 * and rewrite imports across the monorepo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SERVER_PREFIXES = [
  'assistant/codeSandbox',
  'assistant/agentLoop',
  'assistant/agentRuntime',
  'assistant/mcpBridge',
  'assistant/subAgent',
  'assistant/tools/productTools',
  'assistant/tools/mediaTools',
  'desktopEnvFile',
  'faceObfuscate',
  'imageConverter',
  'mediaSign',
  'persistDataUrl',
  'persistRemoteLocal',
  'prisma',
  'safeStoragePath',
  'safeUrl',
  'storage',
  'storagePaths',
  'videoDeconstructService',
  'apiaScraper',
  'qiyunScraper',
  'apiAuth',
];

const SERVER_TEST_HINTS = [
  'prisma.allowed-tables',
  'storagePaths',
  'videoDeconstructService',
  'storage.test',
  'apiAuth.test',
  'apiaScraper',
  'qiyunScraper',
  'persistRemoteLocal',
  'safeStoragePath',
  'codeSandbox',
  'codeMode.test',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

function relPosix(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

function isServerFile(rel) {
  const n = rel.replace(/\\/g, '/');
  if (SERVER_PREFIXES.some((p) => n === p || n.startsWith(p + '.') || n.startsWith(p + '/'))) return true;
  if (n.includes('__tests__/') || n.includes('.test.')) {
    if (SERVER_TEST_HINTS.some((h) => n.includes(h))) return true;
  }
  return false;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function writeText(dest, text) {
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, text, 'utf8');
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

// --- 1. Split shared ---
const sharedSrc = path.join(root, 'app/shared/src');
const domainSrc = path.join(root, 'packages/domain/src');
const serverSrc = path.join(root, 'packages/server-kit/src');
const contractsSrc = path.join(root, 'packages/contracts/src');

rmrf(path.join(root, 'packages/domain'));
rmrf(path.join(root, 'packages/server-kit'));
rmrf(path.join(root, 'packages/contracts'));

const sharedFiles = walk(sharedSrc).filter((f) => /\.(ts|tsx)$/.test(f));

for (const f of sharedFiles) {
  const rel = relPosix(sharedSrc, f);
  if (rel === 'index.ts') continue; // rewrite below
  if (rel === 'sceneBundle.ts') continue; // special split
  const destRoot = isServerFile(rel) ? serverSrc : domainSrc;
  copyFile(f, path.join(destRoot, rel));
}

// sceneBundle: domain without prisma backfill; server-kit keeps backfill
const sceneRaw = fs.readFileSync(path.join(sharedSrc, 'sceneBundle.ts'), 'utf8');
const domainScene = sceneRaw
  .replace(/import type \{ PrismaClient \} from '@prisma\/client';\r?\n/, '')
  .replace(/\r?\n\/\*\* 按 sourceImageIndex[\s\S]*$/, '\n');
writeText(path.join(domainSrc, 'sceneBundle.ts'), domainScene);

const backfillMatch = sceneRaw.match(/\/\*\* 按 sourceImageIndex[\s\S]*$/);
writeText(
  path.join(serverSrc, 'sceneBundleBackfill.ts'),
  `import type { PrismaClient } from '@prisma/client';\n\n${(backfillMatch?.[0] || '').trim()}\n`,
);

writeText(
  path.join(domainSrc, 'index.ts'),
  `/** @beike/domain — prefer deep imports: \`@beike/domain/drawing\`, etc. */\nexport {};\n`,
);
writeText(
  path.join(serverSrc, 'index.ts'),
  `/** @beike/server-kit — prefer deep imports: \`@beike/server-kit/prisma\`, etc. */\nexport {};\n`,
);

// --- 2. Move contracts ---
const oldContracts = path.join(root, 'app/contracts/src');
for (const f of walk(oldContracts).filter((x) => x.endsWith('.ts'))) {
  copyFile(f, path.join(contractsSrc, relPosix(oldContracts, f)));
}

// --- 3. Package manifests ---
writeText(
  path.join(root, 'packages/domain/package.json'),
  JSON.stringify(
    {
      name: '@beike/domain',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './src/index.ts',
      types: './src/index.ts',
      exports: {
        '.': './src/index.ts',
        './modelAdapters': './src/modelAdapters/index.ts',
        './prompt-engine': './src/prompt-engine/index.ts',
        './*': './src/*',
      },
      scripts: {
        typecheck: 'tsc --noEmit -p tsconfig.json',
        test: 'vitest run --config ../../works/configs/vitest.config.ts',
      },
    },
    null,
    2,
  ) + '\n',
);

writeText(
  path.join(root, 'packages/server-kit/package.json'),
  JSON.stringify(
    {
      name: '@beike/server-kit',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './src/index.ts',
      types: './src/index.ts',
      exports: {
        '.': './src/index.ts',
        './*': './src/*',
      },
      scripts: {
        typecheck: 'tsc --noEmit -p tsconfig.json',
        test: 'vitest run --config ../../works/configs/vitest.config.ts',
      },
      dependencies: {
        '@beike/domain': '*',
        '@beike/prisma': '*',
        'quickjs-emscripten': '0.32.0',
        '@aws-sdk/client-s3': '^3.1111.0',
        '@prisma/client': '^5.22.0',
        sharp: '^0.35.3',
      },
    },
    null,
    2,
  ) + '\n',
);

writeText(
  path.join(root, 'packages/contracts/package.json'),
  JSON.stringify(
    {
      name: '@beike/contracts',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './src/index.ts',
      types: './src/index.ts',
      exports: {
        '.': './src/index.ts',
        './*': './src/*',
      },
      dependencies: {
        zod: '^3.25.76',
      },
      scripts: {
        typecheck: 'tsc --noEmit -p tsconfig.json',
      },
    },
    null,
    2,
  ) + '\n',
);

const tsDomain = {
  extends: '../../works/configs/tsconfig.base.json',
  compilerOptions: {
    lib: ['ES2022', 'DOM'],
    rootDir: 'src',
    noEmit: true,
    paths: {
      '@beike/domain': ['./src/index.ts'],
      '@beike/domain/*': ['./src/*'],
    },
  },
  include: ['src/**/*.ts'],
  exclude: ['node_modules'],
};
const tsServer = {
  extends: '../../works/configs/tsconfig.base.json',
  compilerOptions: {
    lib: ['ES2022'],
    rootDir: 'src',
    noEmit: true,
    paths: {
      '@beike/server-kit': ['./src/index.ts'],
      '@beike/server-kit/*': ['./src/*'],
      '@beike/domain': ['../domain/src/index.ts'],
      '@beike/domain/*': ['../domain/src/*'],
    },
  },
  include: ['src/**/*.ts'],
  exclude: ['node_modules'],
};
const tsContracts = {
  extends: '../../works/configs/tsconfig.base.json',
  compilerOptions: {
    lib: ['ES2022'],
    rootDir: 'src',
    noEmit: true,
  },
  include: ['src/**/*.ts'],
  exclude: ['node_modules'],
};

writeText(path.join(root, 'packages/domain/tsconfig.json'), JSON.stringify(tsDomain, null, 2) + '\n');
writeText(path.join(root, 'packages/server-kit/tsconfig.json'), JSON.stringify(tsServer, null, 2) + '\n');
writeText(path.join(root, 'packages/contracts/tsconfig.json'), JSON.stringify(tsContracts, null, 2) + '\n');

// --- 4. Rewrite imports inside packages ---

function rewritePackageImports(filePath, kind) {
  let text = fs.readFileSync(filePath, 'utf8');
  const orig = text;
  if (kind === 'server') {
    // server-kit: shared server modules → relative or self; domain modules → @beike/domain
    text = text.replace(/from ['"]@beike\/shared\/(prisma|storage|storagePaths|imageConverter|faceObfuscate|persistDataUrl|persistRemoteLocal|desktopEnvFile|mediaSign|apiAuth|apiaScraper|qiyunScraper|safeUrl|safeStoragePath|videoDeconstructService)['"]/g,
      (m, mod) => {
        const relDir = path.dirname(filePath);
        const target = path.join(serverSrc, mod);
        let rel = path.relative(relDir, target).split(path.sep).join('/');
        if (!rel.startsWith('.')) rel = './' + rel;
        return `from '${rel}'`;
      });
    text = text.replace(/from ['"]@beike\/shared\/(assistant\/[^'"]+)['"]/g, (m, mod) => {
      if (/^(assistant\/(?:agentLoop|agentRuntime|codeSandbox|mcpBridge|subAgent|tools\/(?:productTools|mediaTools)))/.test(mod)) {
        const relDir = path.dirname(filePath);
        const target = path.join(serverSrc, mod);
        let rel = path.relative(relDir, target).split(path.sep).join('/');
        if (!rel.startsWith('.')) rel = './' + rel;
        return `from '${rel}'`;
      }
      return `from '@beike/domain/${mod}'`;
    });
    text = text.replace(/from ['"]@beike\/shared\/([^'"]+)['"]/g, `from '@beike/domain/$1'`);
  } else {
    text = text.replace(/from ['"]@beike\/shared\/([^'"]+)['"]/g, `from '@beike/domain/$1'`);
  }
  if (text !== orig) fs.writeFileSync(filePath, text, 'utf8');
}

for (const f of walk(domainSrc).filter((x) => x.endsWith('.ts'))) rewritePackageImports(f, 'domain');
for (const f of walk(serverSrc).filter((x) => x.endsWith('.ts'))) rewritePackageImports(f, 'server');

// Fix relative imports in server assistant that pointed to ../videoDeconstructService etc. — already relative, OK.
// Fix agentLoop importing @beike/domain/gatewayUrl — done by rewrite.

// toolExecutor imports ../codeSandbox — same package, OK.
// agentLoop imports ../videoDeconstructService — need to ensure videoDeconstruct is in server-kit — yes.

// productTools imports prisma via @beike/shared — rewritten to relative.

// --- 5. Rewrite app/web and app/api and works scripts ---
const SERVER_IMPORT_MODS = new Set([
  'prisma',
  'storage',
  'storagePaths',
  'imageConverter',
  'faceObfuscate',
  'persistDataUrl',
  'persistRemoteLocal',
  'desktopEnvFile',
  'mediaSign',
  'apiAuth',
  'apiaScraper',
  'qiyunScraper',
  'safeUrl',
  'safeStoragePath',
  'videoDeconstructService',
  'sceneBundleBackfill',
]);

function rewriteConsumer(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const orig = text;
  text = text.replace(/from ['"]@beike\/shared\/([^'"]+)['"]/g, (m, mod) => {
    const top = mod.split('/')[0];
    const isServer =
      SERVER_IMPORT_MODS.has(top) ||
      SERVER_IMPORT_MODS.has(mod) ||
      /^(assistant\/(?:agentLoop|agentRuntime|codeSandbox|mcpBridge|subAgent|tools\/(?:productTools|mediaTools)))/.test(mod);
    return `from '@beike/${isServer ? 'server-kit' : 'domain'}/${mod}'`;
  });
  text = text.replace(/from ['"]@beike\/shared['"]/g, `from '@beike/domain'`);
  // dynamic or type imports with same pattern already covered
  if (text !== orig) fs.writeFileSync(filePath, text, 'utf8');
}

const consumerRoots = [
  path.join(root, 'app/web/src'),
  path.join(root, 'app/api/src'),
  path.join(root, 'works'),
];
for (const cr of consumerRoots) {
  for (const f of walk(cr).filter((x) => /\.(ts|tsx|mjs|js)$/.test(x) && !x.includes('node_modules'))) {
    rewriteConsumer(f);
  }
}

// --- 6. Update package.json deps ---
function patchJson(file, fn) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(j);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}

patchJson(path.join(root, 'app/web/package.json'), (j) => {
  delete j.dependencies['@beike/shared'];
  j.dependencies['@beike/domain'] = '*';
  j.dependencies['@beike/contracts'] = '*';
});

patchJson(path.join(root, 'app/api/package.json'), (j) => {
  delete j.dependencies['@beike/shared'];
  j.dependencies['@beike/domain'] = '*';
  j.dependencies['@beike/server-kit'] = '*';
  j.dependencies['@beike/contracts'] = '*';
});

// Root workspaces
patchJson(path.join(root, 'package.json'), (j) => {
  j.workspaces = ['app/*', 'packages/*', 'db/*'];
  // Prefer pnpm in script docs later; keep npm run internal for -w compat or switch key scripts
  for (const [k, v] of Object.entries(j.scripts || {})) {
    if (typeof v === 'string' && v.includes('npm run')) {
      j.scripts[k] = v.replace(/\bnpm run\b/g, 'pnpm run').replace(/\bnpm install\b/g, 'pnpm install');
    }
  }
});

const pnpmWs = `packages:
  - 'app/*'
  - 'packages/*'
  - 'db/*'
allowBuilds:
  esbuild: true
  '@prisma/client': true
  '@prisma/engines': true
  prisma: true
  '@vgpu/adapter-node': true
  webgpu: true
  sharp: true

# Resolve internal @beike packages from this workspace.
linkWorkspacePackages: true
`;
fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), pnpmWs);

// tsconfig paths
patchJson(path.join(root, 'tsconfig.json'), (j) => {
  j.compilerOptions.paths = {
    '@/*': ['./app/web/src/*'],
    '@beike/domain': ['./packages/domain/src/index.ts'],
    '@beike/domain/*': ['./packages/domain/src/*'],
    '@beike/server-kit': ['./packages/server-kit/src/index.ts'],
    '@beike/server-kit/*': ['./packages/server-kit/src/*'],
    '@beike/contracts': ['./packages/contracts/src/index.ts'],
    '@beike/contracts/*': ['./packages/contracts/src/*'],
  };
  j.include = [
    'app/web/src/**/*.ts',
    'app/web/src/**/*.tsx',
    'app/web/src/vite-env.d.ts',
    'app/api/src/**/*.ts',
    'packages/domain/src/**/*.ts',
    'packages/server-kit/src/**/*.ts',
    'packages/contracts/src/**/*.ts',
  ];
});

// vite aliases
const vitePath = path.join(root, 'app/web/vite.config.ts');
let vite = fs.readFileSync(vitePath, 'utf8');
vite = vite
  .replace(
    /workspaceRoot, '\.desktop-dev-port'\)\)[\s\S]*?resolve\(webRoot, '\.\.\/\.\.\/\.\.\/\.desktop-dev-port'\)/,
    `workspaceRoot, '.desktop-dev-port'))`,
  )
  .replace(
    `'@beike/shared': resolve(workspaceRoot, 'app/shared/src'),\n      '@beike/contracts': resolve(workspaceRoot, 'app/contracts/src'),`,
    `'@beike/domain': resolve(workspaceRoot, 'packages/domain/src'),\n      '@beike/contracts': resolve(workspaceRoot, 'packages/contracts/src'),`,
  );
// Fix port file to only use workspace root
vite = vite.replace(
  /const portFile = existsSync\(resolve\(workspaceRoot, '\.desktop-dev-port'\)\)\s*\? resolve\(workspaceRoot, '\.desktop-dev-port'\)\s*: resolve\(webRoot, '\.\.\/\.\.\/\.\.\/\.desktop-dev-port'\);/,
  `const portFile = resolve(workspaceRoot, '.desktop-dev-port');`,
);
fs.writeFileSync(vitePath, vite, 'utf8');

// check-root-layout
writeText(
  path.join(root, 'works/scripts/check-root-layout.mjs'),
  `#!/usr/bin/env node
/**
 * 校验单核扁平架构下的核心目录完整性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');

const REQUIRED_DIRS = ['app', 'packages', 'db', 'desktop', 'works', 'docs'];

const missing = REQUIRED_DIRS.filter((name) => {
  const dir = path.join(workspaceRoot, name);
  return !fs.existsSync(dir) || !fs.statSync(dir).isDirectory();
});

if (missing.length > 0) {
  console.error('[check:root-layout] 缺失核心目录：' + missing.join('、'));
  process.exit(1);
}

console.log('[check:root-layout] OK');
`,
);

// Remove old packages (source only; leave node_modules cleanup to pnpm)
rmrf(path.join(root, 'app/shared'));
rmrf(path.join(root, 'app/contracts'));

console.log('Migration complete.');
console.log('domain files:', walk(domainSrc).length);
console.log('server-kit files:', walk(serverSrc).length);
console.log('contracts files:', walk(contractsSrc).length);
