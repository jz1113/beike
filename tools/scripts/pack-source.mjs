#!/usr/bin/env node
/**
 * Create a source-only archive (excludes node_modules, target, sidecar binaries, caches).
 * Output: ../阿卓工作台-源码[-含密钥]-<date>.zip (or .tar.gz)
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const isZip = process.argv.includes('--zip');
const keepEnv = process.argv.includes('--keep-env') || process.env.KEEP_ENV === '1';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const parent = dirname(repoRoot);
const folderName = basename(repoRoot);
const date = new Date().toISOString().slice(0, 10);
const ext = isZip ? 'zip' : 'tar.gz';
const outName = `${folderName}-源码${keepEnv ? '(含密钥)' : ''}-${date}.${ext}`;
const outPath = join(parent, outName);

console.log(`→ 准备打包源码: ${outPath} (含环境配置: ${keepEnv ? '是' : '否'}, 格式: ${ext})`);

// 精准收集受控文件（排除已删除的）
const gitTracked = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files'], { cwd: repoRoot, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const gitDeleted = new Set(spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--deleted'], { cwd: repoRoot, encoding: 'utf8' }).stdout.split('\n').filter(Boolean));
const activeTracked = gitTracked.filter((f) => !gitDeleted.has(f));

// 收集未跟踪但未被 gitignore 排除的新增源码
const untracked = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

let allFiles = [...activeTracked, ...untracked];

if (keepEnv) {
  const envCandidates = ['.env', '.env.example', '.env.production', 'packages/prisma/dev.db', '工程/.env', '工程/.env.example'];
  for (const ef of envCandidates) {
    if (fs.existsSync(join(repoRoot, ef))) {
      allFiles.push(ef);
    }
  }
}

// 去重、排序并过滤真实存在的文件
allFiles = Array.from(new Set(allFiles)).sort().filter((f) => {
  const full = join(repoRoot, f);
  try {
    return fs.statSync(full).isFile();
  } catch {
    return false;
  }
});

console.log(`→ 共收集到 ${allFiles.length} 个源码与资源文件...`);

if (isZip) {
  // 使用 python3 zipfile 进行完全无乱码的跨平台打包
  const pyScript = `
import zipfile, sys, os, hashlib

repo_root = sys.argv[1]
out_path = sys.argv[2]
folder_name = sys.argv[3]
file_list = sys.stdin.read().splitlines()

with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for rel in file_list:
        full = os.path.join(repo_root, rel)
        arcname = os.path.join(folder_name, rel)
        zf.write(full, arcname)

size = os.path.getsize(out_path)
h = hashlib.sha256()
with open(out_path, "rb") as f:
    while chunk := f.read(1024 * 1024):
        h.update(chunk)
print(f"SIZE:{size}")
print(f"SHA256:{h.hexdigest()}")
`;
  const r = spawnSync('python3', ['-c', pyScript, repoRoot, outPath, folderName], {
    input: allFiles.join('\n'),
    encoding: 'utf8'
  });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  const lines = r.stdout.split('\n');
  const sizeLine = lines.find((l) => l.startsWith('SIZE:'))?.replace('SIZE:', '') || '0';
  const shaLine = lines.find((l) => l.startsWith('SHA256:'))?.replace('SHA256:', '') || '';
  const mb = (parseInt(sizeLine, 10) / (1024 * 1024)).toFixed(2);
  console.log(`✓ 打包成功！文件路径: ${outPath}`);
  console.log(`  包大小: ${mb} MB (${sizeLine} 字节)`);
  if (shaLine) console.log(`  SHA256: ${shaLine}`);
} else {
  // tar 打包
  const listFile = join(repoRoot, '.tmp_pack_files.txt');
  fs.writeFileSync(listFile, allFiles.join('\n'), 'utf8');
  const r = spawnSync('tar', ['-czf', outPath, '-T', listFile], { cwd: repoRoot, stdio: 'inherit' });
  try { fs.unlinkSync(listFile); } catch {}
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  console.log(`✓ 打包成功！文件路径: ${outPath}`);
}

