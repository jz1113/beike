import { jsonFail, jsonOk } from '../../core/handler';
import { readJsonBody } from '../../core/validate';
import {
  applyCategoryMigration,
  listServerSubCategories,
  previewCategoryMigration,
} from '../../repositories/categoryMigration';

export async function LIST() {
  return jsonOk({ categories: await listServerSubCategories() });
}

export async function PREVIEW(req: Request) {
  try {
    return jsonOk({ preview: await previewCategoryMigration(await readJsonBody(req, { local: [] })) });
  } catch {
    return jsonFail('类目迁移预览参数不正确', 400);
  }
}

export async function APPLY(req: Request) {
  try {
    return jsonOk({ categories: await applyCategoryMigration(await readJsonBody(req)) });
  } catch {
    return jsonFail('类目迁移写入失败', 400);
  }
}
