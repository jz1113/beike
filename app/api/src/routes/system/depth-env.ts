import { jsonResponse } from '../../core/http';
import { DEPTH_MODEL_SETUP_COMMAND } from '@beike/domain/depthVideo';
import { checkDepthModelReady, getDepthEnvStatus } from '../../services/depthEnvCheck';
import { getFfmpegEnvStatus } from '../../services/videoFrames';

/**
 * GET /api/system/depth-env
 */
export async function GET() {
  const ffmpegStatus = await getFfmpegEnvStatus();
  const depthEnv = await getDepthEnvStatus();
  const ready = ffmpegStatus.ffmpeg && ffmpegStatus.ffprobe && depthEnv.depthModelReady;

  let message = '深度动作捕捉环境已就绪';
  if (!ffmpegStatus.ffmpeg || !ffmpegStatus.ffprobe) {
    message = ffmpegStatus.detail;
  } else if (!depthEnv.depthModelReady) {
    message = `深度模型未安装，请在终端执行：${DEPTH_MODEL_SETUP_COMMAND}`;
  }

  return jsonResponse({
    success: true,
    ffmpeg: ffmpegStatus.ffmpeg,
    ffprobe: ffmpegStatus.ffprobe,
    ffmpegPath: ffmpegStatus.ffmpegPath,
    ffprobePath: ffmpegStatus.ffprobePath,
    opencv: depthEnv.opencv,
    numpy: depthEnv.numpy,
    scipy: depthEnv.scipy,
    torch: depthEnv.torch,
    transformers: depthEnv.transformers,
    depthModelReady: depthEnv.depthModelReady,
    pythonDepth: depthEnv.depthModelReady,
    pythonDetail: depthEnv.pythonDetail,
    setupCommand: DEPTH_MODEL_SETUP_COMMAND,
    forceStub: false,
    ready,
    message,
  });
}

export { checkDepthModelReady, getDepthEnvStatus };
