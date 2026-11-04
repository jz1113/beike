import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { registerRefMediaKind, registerRefMediaName } from '@client/shared/media/refMediaRegistry';
import { useAppStore } from '@client/store';
import type { LibraryMedia } from './mediaIndex';

/** Keep the draft and add the original asset, including the selected angle of a scene. */
export function addLibraryReference(item: LibraryMedia) {
  if (item.kind === 'audio') return;
  const state = useAppStore.getState();
  const video = state.quickGenMode === 'video';
  registerRefMediaKind(item.url, item.kind);
  registerRefMediaName(item.url, item.name);
  if (video && item.kind === 'image' && state.quickVideoRefMode === 'first_last_frame') {
    const { quickVideoFirstFrame: first, quickVideoLastFrame: last } = state;
    if (first === item.url || last === item.url) return;
    if (!first) return state.setQuickVideoFirstFrame(item.url);
    if (!last) return state.setQuickVideoLastFrame(item.url);
    throw new Error('首帧和尾帧都已有素材，请先在首页移除一帧。');
  }
  if (video && item.kind === 'image' && state.quickVideoRefMode === 'multi_frame') {
    state.setQuickVideoMultiFrames([...new Set([...state.quickVideoMultiFrames, item.url])]);
    return;
  }
  const frames = !video ? [] : state.quickVideoRefMode === 'first_last_frame'
    ? [state.quickVideoFirstFrame, state.quickVideoLastFrame].filter((url): url is string => Boolean(url))
    : state.quickVideoRefMode === 'multi_frame' ? state.quickVideoMultiFrames : [];
  const refs = [...new Set([...state.quickRefImages, ...frames, item.url])];
  const useVideo = video || refs.some(isVideoMediaUrl);
  useAppStore.setState({
    quickGenMode: useVideo ? 'video' : 'image',
    quickRefImage: refs[0], quickRefImages: refs,
    ...(useVideo && (item.kind === 'video' || !video || state.quickVideoRefMode === 'text') && { quickVideoRefMode: 'omni' }),
  });
}
