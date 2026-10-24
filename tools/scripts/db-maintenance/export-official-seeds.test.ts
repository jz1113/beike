import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportOfficialSeeds } from './export-official-seeds.mjs';

const python = process.env.SQLITE_BACKUP_PYTHON || 'python3';
const sqliteAvailable = spawnSync(python, ['-c', 'import sqlite3']).status === 0;
let directory: string;

beforeEach(() => { directory = fs.mkdtempSync(path.join(tmpdir(), 'beike-seed-export-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

describe.skipIf(!sqliteAvailable)('official seed export', () => {
  it('writes the catalog consumed by both clients and Go while preserving record IDs', () => {
    const database = path.join(directory, 'input.db');
    const create = spawnSync(python, ['-c', `
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('CREATE TABLE StyleRecipe (id TEXT, name TEXT, category TEXT, promptSnippet TEXT, workspaceId TEXT, createdAt INTEGER)')
    db.execute("INSERT INTO StyleRecipe VALUES ('existing-id', '示例架构', 'digital_3c', '保留实物结构', 'private-workspace', 123)")
    for table in ['FullPromptAsset', 'SceneAsset', 'OutfitAsset', 'ActionAsset', 'PersonaAsset', 'PromptAlbum', 'AssetProductCategory']:
        db.execute('CREATE TABLE ' + table + ' (id TEXT)')
`, database], { encoding: 'utf8' });
    expect(create.status, create.stderr).toBe(0);
    const source = fs.readFileSync(database);
    const result = exportOfficialSeeds(database, directory);
    expect(path.basename(result.recipesPath)).toBe('officialMasterRecipes.json');
    const recipes = JSON.parse(fs.readFileSync(result.recipesPath, 'utf8'));
    expect(recipes).toEqual([{
      id: 'existing-id', name: '示例架构', category: 'digital_3c', tag: '', desc: '',
      promptSnippet: '保留实物结构', coverUrl: null, sampleImages: null, isFavorite: true,
    }]);
    const assets = JSON.parse(fs.readFileSync(result.assetsPath, 'utf8'));
    expect(assets.data.styleRecipes[0].workspaceId).toBe('private-workspace');
    expect(fs.existsSync(path.join(directory, 'src/shared/data/styleRecipes.json'))).toBe(false);
    expect(fs.existsSync(result.snapshotPath)).toBe(true);
    expect(fs.readFileSync(database)).toEqual(source);
  });
});
