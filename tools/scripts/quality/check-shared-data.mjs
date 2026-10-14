#!/usr/bin/env node
/** Keep Go-readable JSON snapshots aligned with the TypeScript catalogs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_GEN_MODELS } from '../../../src/shared/domain/media/drawing.ts';
import { DEFAULT_SUBCATEGORIES_MAP } from '../../../src/shared/domain/products/product-category/defs';
import { OFFICIAL_MASTER_RECIPES } from '../../../src/shared/domain/prompts/masterRecipes.ts';
import { VISION_MODELS } from '../../../src/shared/domain/prompts/vision.ts';
import { OPENAI_TOOLS } from '../../../src/shared/domain/assistant/tools/defs.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const files = {
  'src/shared/data/systemConfigModels.json': { visionModels: VISION_MODELS, imageModels: IMAGE_GEN_MODELS },
  'src/shared/data/defaultSubCategories.json': DEFAULT_SUBCATEGORIES_MAP,
  'src/shared/data/officialMasterRecipes.json': OFFICIAL_MASTER_RECIPES,
  'src/shared/data/assistantTools.json': OPENAI_TOOLS,
  'src/backend/internal/assistant/assistantTools.json': OPENAI_TOOLS,
};
const write = process.argv.includes('--write');
for (const [relative, value] of Object.entries(files)) {
  const target = path.join(root, relative);
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (write) {
    fs.writeFileSync(target, rendered);
    continue;
  }
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== rendered) {
    console.error(`[shared-data] ${relative} 与当前目录不一致。运行 node --import tsx tools/scripts/quality/check-shared-data.mjs --write`);
    process.exit(1);
  }
}
console.log('[shared-data] OK');
