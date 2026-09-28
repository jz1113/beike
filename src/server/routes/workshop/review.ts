import { jsonFail, jsonOk } from '../../core/handler';
import { readJsonBody } from '../../core/validate';
import { reviewWorkshopOutput } from '../../services/workshop/outputReview';
import { AppError } from '../../core/errors';

export async function REVIEW(req: Request, taskId: string) {
  if (!taskId) return jsonFail('任务标识不正确', 400);
  try {
    return jsonOk(await reviewWorkshopOutput(taskId, await readJsonBody(req)));
  } catch (error) {
    if (error instanceof AppError) return jsonFail(error.message, error.status, error.code);
    return jsonFail('审核提交失败', 400);
  }
}
