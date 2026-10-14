#!/usr/bin/env node
/**
 * 从本机桌面数据库导出类目拍摄架构与提示词资产，写入仓库官方种子。
 * 默认读取 macOS：~/Library/Application Support/com.azhuo.workbench/azhuo.db
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultDb = join(homedir(), 'Library/Application Support/com.azhuo.workbench/azhuo.db');
const dbPath = process.env.AZHUO_DB_PATH || defaultDb;
const seedDir = join(root, 'src/shared/data');
const backupDir = join(root, '.local/deploy-backup');

if (!existsSync(dbPath)) {
  console.error(`找不到数据库：${dbPath}`);
  process.exit(1);
}

mkdirSync(seedDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

const py = `
import json, sqlite3, sys
db, recipes_path, assets_path = sys.argv[1], sys.argv[2], sys.argv[3]
con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
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
open(recipes_path, "w", encoding="utf-8").write(json.dumps(recipes, ensure_ascii=False, indent=2))
open(assets_path, "w", encoding="utf-8").write(json.dumps(assets, ensure_ascii=False))
print(json.dumps(assets["counts"], ensure_ascii=False))
`;

const recipesPath = join(seedDir, 'styleRecipes.json');
const assetsPath = join(seedDir, 'promptAssets.json');
const counts = execFileSync('python3', ['-c', py, dbPath, recipesPath, assetsPath], { encoding: 'utf8' }).trim();
cpSync(dbPath, join(backupDir, 'azhuo.db'));
console.log(`已导出官方种子：${counts}`);
console.log(`架构：${recipesPath}`);
console.log(`资产：${assetsPath}`);
console.log(`数据库备份：${join(backupDir, 'azhuo.db')}（不进 Git）`);
