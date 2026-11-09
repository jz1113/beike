import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import loader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasm from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import scalarLoader from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import scalarWasm from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import model from '@client/assets/face-detection/blaze_face_full_range.tflite?url';
export interface FaceRegion { x:number; y:number; width:number; height:number }

async function createDetector() {
  const simd = await FilesetResolver.isSimdSupported();
  return FaceDetector.createFromOptions({ wasmLoaderPath: simd ? loader : scalarLoader, wasmBinaryPath: simd ? wasm : scalarWasm },
    { baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'IMAGE' });
}
let detector: Promise<FaceDetector> | undefined;

export async function detectImageFaces(image: HTMLImageElement): Promise<FaceRegion[]> {
  detector ??= createDetector().catch((error) => { detector = undefined; throw error; });
  const result = (await detector).detect(image);
  return result.detections.flatMap(({ boundingBox: box }) => {
    if (!box) return [];
    const x = Math.max(0, (box.originX - box.width * 0.06) / image.naturalWidth);
    const y = Math.max(0, (box.originY - box.height * 0.06) / image.naturalHeight);
    const right = Math.min(1, (box.originX + box.width * 1.06) / image.naturalWidth);
    const bottom = Math.min(1, (box.originY + box.height * 1.06) / image.naturalHeight);
    return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
  });
}
