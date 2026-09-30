import { deconstructJobStopSchema, deconstructJobSubmitSchema } from '@shared/contracts/deconstructJobs';
import { jsonResponse } from '@server/core/http';
import { AppError, errorResponse } from '@server/core/errors';
import { readResponseBodyLimited } from '@server/core/readBodyLimited';
import { getDeconstructJob, listDeconstructJobs } from '@server/repositories/deconstructJobs';
import { AssetCategoryError } from '@server/repositories/assetOrganization';
import { requestDeconstructJobStop, submitDeconstructJob } from '@server/services/deconstruct/jobs';

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) return jsonResponse({ success: true, jobs: await listDeconstructJobs() });
  if (jobId.length > 160) return jsonResponse({ success: false, error: '任务 ID 无效' }, 400);
  const job = await getDeconstructJob(jobId);
  return job ? jsonResponse({ success: true, job }) : jsonResponse({ success: false, error: '后台反推任务不存在' }, 404);
}

export async function POST(req: Request) {
  try {
    const body = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 84_000_000);
    if (!body.ok) throw new AppError('本批图集数据过大，请减少图集数量', 413, 'job_body_too_large');
    const value: unknown = JSON.parse(new TextDecoder().decode(body.buffer));
    if (value && typeof value === 'object' && 'action' in value) {
      const stop = deconstructJobStopSchema.safeParse(value);
      if (!stop.success) throw new AppError('停止任务参数无效', 400, 'invalid_job_stop');
      return jsonResponse({ success: true, job: await requestDeconstructJobStop(stop.data.jobId) });
    }
    const parsed = deconstructJobSubmitSchema.safeParse(value);
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || '后台反推参数无效', 400, 'invalid_job_submission');
    return jsonResponse({ success: true, ...await submitDeconstructJob(req, parsed.data) }, 202);
  } catch (error) {
    if (error instanceof AssetCategoryError) return jsonResponse({ success: false, error: error.message }, 400);
    if (error instanceof SyntaxError) return jsonResponse({ success: false, error: '请求数据格式异常' }, 400);
    return errorResponse(error, '后台反推提交失败');
  }
}
