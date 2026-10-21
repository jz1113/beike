import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import type { GatewayEndpoints } from '../types';

function rootOf(baseUrl: string): string {
  return normalizeGatewayBaseUrl(baseUrl);
}

export function unifiedVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = rootOf(baseUrl);
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/v1/videos`,
      `${root}/v1/video/generations`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/v1/query/video_generation?task_id={taskId}`,
    ],
  };
}

export function v1PreferVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = rootOf(baseUrl);
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/v1/videos`,
      `${root}/v1/video/generations`,
      `${root}/xai/v1/videos/generations`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/xai/v1/videos/generations/{taskId}`,
    ],
  };
}

export function seedanceOfficialEndpoints(baseUrl: string): GatewayEndpoints {
  const root = rootOf(baseUrl);
  return {
    submit: [
      `${root}/seedance/v3/contents/generations/tasks`,
      `${root}/v2/videos/generations`,
    ],
    query: [
      `${root}/seedance/v3/contents/generations/tasks/{taskId}`,
      `${root}/v2/videos/generations/{taskId}`,
    ],
  };
}

export function wanOfficialEndpoints(baseUrl: string): GatewayEndpoints {
  const root = rootOf(baseUrl);
  return {
    submit: [
      `${root}/qwen/api/v1/services/aigc/video-generation/video-synthesis`,
      `${root}/api/v1/services/aigc/video-generation/video-synthesis`,
    ],
    query: [
      `${root}/qwen/api/v1/tasks/{taskId}`,
      `${root}/api/v1/tasks/{taskId}`,
    ],
  };
}

export function grokImagineVideoEndpoints(baseUrl: string, mode = 'text'): GatewayEndpoints {
  const root = rootOf(baseUrl);
  const path = mode === 'edit' ? 'edits' : mode === 'extend' ? 'extensions' : 'generations';
  return {
    submit: [`${root}/xai/v1/videos/${path}`],
    query: [`${root}/xai/v1/videos/{taskId}`],
  };
}

export function minimaxVideoEndpoints(modelId: string) {
  return (baseUrl: string): GatewayEndpoints => {
    const root = rootOf(baseUrl);
    if (modelId.toLowerCase().includes('t2v-01')) {
      return {
        submit: [`${root}/minimax/v1/video_generation`],
        query: [`${root}/minimax/v1/query/video_generation?task_id={taskId}`],
      };
    }
    return {
      submit: [
        `${root}/v1/videos`,
        `${root}/v2/videos/generations`,
        `${root}/minimax/v1/video_generation`,
      ],
      query: [
        `${root}/v1/videos/{taskId}`,
        `${root}/v2/videos/generations/{taskId}`,
      ],
    };
  };
}

export function klingModeEndpoints(mode: string) {
  return (baseUrl: string): GatewayEndpoints => {
    const root = rootOf(baseUrl);
    return {
      submit: [`${root}/kling/v1/videos/${mode}`],
      query: [`${root}/kling/v1/videos/${mode}/{taskId}`],
    };
  };
}

export function lumaVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = rootOf(baseUrl);
  return {
    submit: [`${root}/luma/generations`],
    query: [`${root}/luma/generations/{taskId}`],
  };
}

export function viduVideoEndpoints(baseUrl: string, mode = 'text2video'): GatewayEndpoints {
  const root = rootOf(baseUrl);
  const path = mode === 'img2video' || mode === 'image2video'
    ? 'img2video'
    : mode === 'reference' ? 'reference2video' : mode === 'start-end'
      ? 'start-end2video'
      : 'text2video';
  return {
    submit: [`${root}/vidu/v2/${path}`, `${root}/vidu/ent/v2/${path}`],
    query: [`${root}/vidu/v2/tasks/{taskId}/creations`, `${root}/vidu/ent/v2/tasks/{taskId}/creations`],
  };
}
