import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '../../..');
const outDir = 'D:\\打包';

mkdirSync(outDir, { recursive: true });

// 补全环境变量
const userProfile = process.env.USERPROFILE || 'C:\\Users\\Administrator';
const cargoBin = join(userProfile, '.cargo', 'bin');
const npmBin = join(userProfile, 'AppData', 'Roaming', 'npm');
const env = { ...process.env };
env.PATH = `${cargoBin};${npmBin};${env.PATH || ''}`;

console.log('====================================================');
console.log('  贝壳云图 · Windows EXE 安装包构建');
console.log('====================================================');

// 1. 准备桌面环境资源 (Sidecar, API Bundle, 前端产物)
console.log('\n[1/3] 正在准备桌面依赖与 sidecar 资源...');
const prepResult = spawnSync(process.execPath, [join(scriptDir, 'prepare-desktop-bundle.mjs')], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env,
});

if (prepResult.status !== 0) {
  console.error('[错误] 资源准备失败！');
  process.exit(prepResult.status || 1);
}

// 2. 调用 Tauri 构建 Windows NSIS 安装包
console.log('\n[2/3] 正在编译 Rust 核心并构建 NSIS 安装包 (此过程可能需要 2~5 分钟)...');
const buildResult = spawnSync('npx', ['tauri', 'build', '--config', 'desktop/tauri.conf.json', '--bundles', 'nsis'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env,
  shell: true,
});

if (buildResult.status !== 0) {
  console.error('[错误] Tauri 构建失败！');
  process.exit(buildResult.status || 1);
}

// 3. 收集产物并复制到 D:\打包
console.log('\n[3/3] 收集并转存构建产物至 ' + outDir + ' ...');
const nsisDir = join(workspaceRoot, 'desktop/target/release/bundle/nsis');
const standaloneExe = join(workspaceRoot, 'desktop/target/release/azhuo-workbench.exe');

const delivered = [];

if (existsSync(nsisDir)) {
  const files = readdirSync(nsisDir);
  for (const f of files) {
    if (f.endsWith('.exe')) {
      const src = join(nsisDir, f);
      const dest = join(outDir, f);
      copyFileSync(src, dest);
      const sizeMB = (statSync(dest).size / (1024 * 1024)).toFixed(2);
      delivered.push({ name: f, path: dest, size: `${sizeMB} MB`, type: 'NSIS 安装包' });
    }
  }
}

if (existsSync(standaloneExe)) {
  const destStandalone = join(outDir, '贝壳云图_0.0.2_独立运行程序.exe');
  copyFileSync(standaloneExe, destStandalone);
  const sizeMB = (statSync(destStandalone).size / (1024 * 1024)).toFixed(2);
  delivered.push({ name: '贝壳云图_0.0.2_独立运行程序.exe', path: destStandalone, size: `${sizeMB} MB`, type: '独立可执行程序' });
}

console.log('\n====================================================');
console.log('  打包完成！已全部转存至 D:\\打包 目录下：');
console.log('====================================================');
for (const item of delivered) {
  console.log(`- [${item.type}] ${item.name} (${item.size}) -> ${item.path}`);
}
console.log('====================================================\n');
