#!/usr/bin/env node
/**
 * 同步 HRuiCcc/RuiC-PoseAtlas（多视角姿态图鉴 + face.html 人像图鉴）到本机受保护数据目录。
 * 遵循原作者授权规范：图集仅保存在本机数据目录供创作参考与按需导入工作区，不随 Git 仓库提交分发。
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppDataDir } from '../web/web-shared.mjs';

const REPO_URL = 'https://github.com/HRuiCcc/RuiC-PoseAtlas.git';
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const opts = { source: process.env.POSE_ATLAS_SOURCE || '', dest: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source' && argv[i + 1]) {
      opts.source = argv[i + 1];
      i += 1;
    } else if (arg === '--dest' && argv[i + 1]) {
      opts.dest = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

function resolveTargetDir(explicitDest) {
  if (explicitDest) return path.resolve(explicitDest);
  const candidates = [
    path.join(process.env.AZHUO_DATA_DIR || resolveAppDataDir(), 'atlas-catalog'),
    path.join(workspaceRoot, '.local', 'atlas-catalog'),
  ];
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // 当前环境对系统应用目录无写权限时回退至仓库 .local/atlas-catalog
    }
  }
  return path.join(workspaceRoot, '.local', 'atlas-catalog');
}

function runGitClone(targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', REPO_URL, targetDir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`克隆 RuiC-PoseAtlas 失败（退出码 ${code}）`));
    });
  });
}

async function ensureSourceDir(explicitSource) {
  if (explicitSource) {
    const resolved = path.resolve(explicitSource);
    if (!existsSync(path.join(resolved, 'data', 'poses.json'))) {
      throw new Error(`指定的 --source 目录缺少 data/poses.json: ${resolved}`);
    }
    return resolved;
  }
  const tmpCached = path.join(os.tmpdir(), 'RuiC-PoseAtlas');
  if (existsSync(path.join(tmpCached, 'data', 'poses.json'))) {
    console.log(`[atlas] 复用本地缓存仓库: ${tmpCached}`);
    return tmpCached;
  }
  console.log(`[atlas] 正在从 ${REPO_URL} 浅克隆图鉴数据…`);
  await runGitClone(tmpCached);
  return tmpCached;
}

function copyDirIfPresent(srcDir, destDir) {
  if (!existsSync(srcDir)) return false;
  mkdirSync(path.dirname(destDir), { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, force: true });
  return true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sourceDir = await ensureSourceDir(opts.source);
  const destDir = resolveTargetDir(opts.dest);
  mkdirSync(destDir, { recursive: true });

  const posesJsonPath = path.join(sourceDir, 'data', 'poses.json');
  const facesJsonPath = path.join(sourceDir, 'data', 'faces.json');
  const posesRaw = JSON.parse(readFileSync(posesJsonPath, 'utf8'));
  const facesRaw = JSON.parse(readFileSync(facesJsonPath, 'utf8'));

  writeFileSync(path.join(destDir, 'poses.json'), JSON.stringify(posesRaw));
  writeFileSync(path.join(destDir, 'faces.json'), JSON.stringify(facesRaw));

  console.log('[atlas] 正在同步多视角姿态缩略图与高清线稿…');
  copyDirIfPresent(path.join(sourceDir, 'thumbs'), path.join(destDir, 'thumbs'));
  copyDirIfPresent(path.join(sourceDir, 'img'), path.join(destDir, 'img'));

  console.log('[atlas] 正在同步人像与人脸图鉴预览集…');
  copyDirIfPresent(path.join(sourceDir, 'portrait', 'thumbs'), path.join(destDir, 'portrait', 'thumbs'));
  copyDirIfPresent(path.join(sourceDir, 'portrait', 'img'), path.join(destDir, 'portrait', 'img'));

  const meta = {
    syncedAt: new Date().toISOString(),
    poseCount: Array.isArray(posesRaw.poses) ? posesRaw.poses.length : 0,
    poseImageCount: posesRaw.totals?.images || 0,
    faceCount: Array.isArray(facesRaw.images) ? facesRaw.images.length : 0,
  };
  writeFileSync(path.join(destDir, 'manifest-meta.json'), JSON.stringify(meta, null, 2));

  console.log(
    `[atlas] 图鉴同步完成 -> ${destDir}（姿态 ${meta.poseCount} 组 / ${meta.poseImageCount} 张，人像 ${meta.faceCount} 张）`,
  );
}

main().catch((error) => {
  console.error('[atlas]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

