#!/usr/bin/env node
/**
 * 从运行库的一致性快照导出当前前后端共用的官方架构与提示词资产。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqliteFile } from './sqlite-path.mjs';
import { createSqliteSnapshot } from './sqlite-snapshot.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const py = `
import json, sqlite3, sys
db, recipes_path, assets_path = sys.argv[1], sys.argv[2], sys.argv[3]
import pathlib
con = sqlite3.connect(pathlib.Path(db).as_uri() + '?immutable=1', uri=True)
con.row_factory = sqlite3.Row

def dump(table):
    return [dict(r) for r in con.execute(f"SELECT * FROM {table}").fetchall()]

recipes = dump("StyleRecipe")
assets = {
    "version": "official-1.0",
    "system": "beike-yuntu-prompt-assets",
    "exportedFrom": "local-azhuo.db",
    "data": {
        "styleRecipes": recipes,
        "fullPrompts": dump("FullPromptAsset"),
        "scenes": dump("SceneAsset"),
        "outfits": dump("OutfitAsset"),
        "actions": dump("ActionAsset"),
        "personas": dump("PersonaAsset"),
        "albums": dump("PromptAlbum"),
        "productCategories": dump("AssetProductCategory"),
    },
}
assets["counts"] = {k: len(v) for k, v in assets["data"].items()}
official_recipes = [{
    "id": row["id"], "name": row["name"], "category": row.get("category") or "",
    "tag": row.get("tag") or "", "desc": row.get("desc") or "",
    "promptSnippet": row.get("promptSnippet") or "",
    "coverUrl": row.get("coverUrl"), "sampleImages": row.get("sampleImages"),
    "isFavorite": bool(row.get("isFavorite", True)),
} for row in recipes]
if any(not row["id"] or not row["name"] or not row["promptSnippet"] for row in official_recipes):
    raise ValueError("官方架构种子须有 id、名称和提示词正文")
if len({row["id"] for row in official_recipes}) != len(official_recipes):
    raise ValueError("官方架构种子 id 重复")
open(recipes_path, "w", encoding="utf-8").write(json.dumps(official_recipes, ensure_ascii=False, indent=2) + "\\n")
open(assets_path, "w", encoding="utf-8").write(json.dumps(assets, ensure_ascii=False))
print(json.dumps(assets["counts"], ensure_ascii=False))
`;

export function exportOfficialSeeds(dbPath, outputRoot = root) {
  if (!existsSync(dbPath)) throw new Error(`找不到数据库：${dbPath}`);
  const seedDir = join(outputRoot, 'src/shared/data');
  const backupDir = join(outputRoot, '.local/deploy-backup');
  mkdirSync(seedDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = join(backupDir, `azhuo-${stamp}-${randomUUID()}.db`);
  createSqliteSnapshot(dbPath, snapshotPath);
  const recipesPath = join(seedDir, 'officialMasterRecipes.json');
  const assetsPath = join(seedDir, 'promptAssets.json');
  const counts = execFileSync(process.env.SQLITE_BACKUP_PYTHON || 'python3', ['-c', py, snapshotPath, recipesPath, assetsPath], { encoding: 'utf8' }).trim();
  return { counts, recipesPath, assetsPath, snapshotPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = exportOfficialSeeds(resolveSqliteFile(process.argv[2] || process.env.AZHUO_DB_PATH));
  console.log(`已导出官方种子：${result.counts}`);
  console.log(`架构：${result.recipesPath}`);
  console.log(`资产：${result.assetsPath}`);
  console.log(`数据库备份：${result.snapshotPath}（不进 Git）`);
}
