import { draw, effect, init, sampler, storage, surface, target, uniforms } from 'vgpu';
import SHARD_SHADER from './aeroShard.wgsl?raw';
import { LAYER_BLUR_SHADER, SHADOW_SHADER, COMPOSITE_SHADER, MARKER_SHADER, PREFILTER_SHADER, DOWNSAMPLE_SHADER, BLUR_SHADER, FINISH_SHADER } from './aeroPostShaders';
import { FLOATS, CAMERA, FOCUS, LAYER_SCALES, DEPTHS, MARKER_FLOATS, BLOOM_LEVELS, LEVELS, PLACEMENTS, Ring, createShards, AeroSettings } from './aeroShardModel';

export function createAeroState(settings: AeroSettings) {
  return {
    visible: false,
    clock: 0,
    last: 0,
    travel: new Float64Array(LEVELS),
    roll: 0,
    twist: 0,
    drift: 0,
    introAt: -1,
    weights: PLACEMENTS.map((_, index): number => (index === settings.placement ? 1 : 0)),
    weightVelocity: [0, 0, 0, 0],
    shards: createShards(settings.count, 1337),
    order: [] as number[],
    pointer: [0.5, 0.5],
    inside: false,
    presence: 0,
    yaw: 0,
    pitch: 0,
    yawVelocity: 0,
    pitchVelocity: 0,
    pressAt: -1,
    pressPoint: null as number[] | null,
    holding: false,
    hold: 0,
    reach: 0,
    gatherCenter: [0, 0, 0],
    rings: [] as Ring[],
    markerDrift: 0,
    markerTarget: '',
    markerTotal: 0,
    targets: new Map<string, number>(),
    quiet: 0,
    seen: null as AeroSettings | null,
  };
}
export type AeroState = ReturnType<typeof createAeroState>;

export function createAeroCamera(state: AeroState, { output }: AeroResources) {
  const cam = { eye: [0, 0, CAMERA], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], focal: 1 };
  const updateCamera = (s: AeroSettings) => {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    cam.eye[0] = sy * cp * CAMERA;
    cam.eye[1] = sp * CAMERA;
    cam.eye[2] = cy * cp * CAMERA;
    cam.forward[0] = -sy * cp;
    cam.forward[1] = -sp;
    cam.forward[2] = -cy * cp;
    const rl = Math.hypot(cam.forward[2], cam.forward[0]) || 1;
    cam.right[0] = -cam.forward[2] / rl;
    cam.right[1] = 0;
    cam.right[2] = cam.forward[0] / rl;
    cam.up[0] = cam.right[1] * cam.forward[2] - cam.right[2] * cam.forward[1];
    cam.up[1] = cam.right[2] * cam.forward[0] - cam.right[0] * cam.forward[2];
    cam.up[2] = cam.right[0] * cam.forward[1] - cam.right[1] * cam.forward[0];
    cam.focal = output.size[1] * 0.5 * CAMERA * s.scale;
  };
  const ray = [0, 0, 1];
  const rayAt = (px: number, py: number) => {
    const x = (px - 0.5) * output.size[0];
    const y = (0.5 - py) * output.size[1];
    ray[0] = cam.forward[0] * cam.focal + cam.right[0] * x + cam.up[0] * y;
    ray[1] = cam.forward[1] * cam.focal + cam.right[1] * x + cam.up[1] * y;
    ray[2] = cam.forward[2] * cam.focal + cam.right[2] * x + cam.up[2] * y;
    const length = Math.hypot(ray[0], ray[1], ray[2]) || 1;
    ray[0] /= length;
    ray[1] /= length;
    ray[2] /= length;
    return ray;
  };
  return { cam, updateCamera, ray, rayAt };
}
export type AeroCamera = ReturnType<typeof createAeroCamera>;
export async function createAeroResources(instance: Awaited<ReturnType<typeof init>>, canvas: HTMLCanvasElement, container: HTMLDivElement, settingsRef: {
  current: AeroSettings;
}, format: string) {
  const sizeFor = (): [
    number,
    number
  ] => {
    const ratio = Math.min(window.devicePixelRatio || 1, settingsRef.current.dpr);
    return [
      Math.max(1, Math.round(container.clientWidth * ratio)),
      Math.max(1, Math.round(container.clientHeight * ratio))
    ];
  };
  const output = surface(instance, canvas, {
    autoResize: false,
    size: sizeFor(),
    format,
    alphaMode: 'premultiplied'
  });
  const linear = sampler(instance, {
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge'
  });
  const scene = target(instance, { size: output.size, format: 'rgba16float' });
  const levelSize = (index: number): [
    number,
    number
  ] => [
    Math.max(1, Math.round(output.size[0] / 2 ** (index + 1))),
    Math.max(1, Math.round(output.size[1] / 2 ** (index + 1)))
  ];
  const levels = Array.from({ length: BLOOM_LEVELS }, (_, index) => ({
    main: target(instance, { size: levelSize(index), format: 'rgba16float' }),
    spare: target(instance, { size: levelSize(index), format: 'rgba16float' })
  }));
  const frameParams = uniforms(instance, {
    view: [1, 1, 1, 0],
    eye: [0, 0, CAMERA, FOCUS],
    forward: [0, 0, -1, 0],
    right: [1, 0, 0, 0],
    up: [0, 1, 0, 0],
    shard: [0.54, 0.42, 0.74, 0.5],
    accent: [0.66, 0.33, 0.97, 0],
    marker: [0, 1, 4, CAMERA],
    surface: [7, 0, 0, 2.4]
  });
  let markerCapacity = 0;
  let markerBuffer: ReturnType<typeof storage> | null = null;
  let markerData = new Float32Array(0);
  const markerDraw = draw(instance, {
    shader: MARKER_SHADER,
    vertices: 6,
    cull: 'none',
    depth: false,
    blend: 'premultiplied',
    label: 'aero-shards-markers'
  });
  const ensureMarkers = (needed: number) => {
    if (needed <= markerCapacity && markerBuffer)
      return;
    markerCapacity = Math.max(needed, 512);
    markerData = new Float32Array(markerCapacity * MARKER_FLOATS);
    markerBuffer = storage(instance, markerData.byteLength, 'read');
    markerDraw.set({ scene: frameParams, markers: markerBuffer });
  };
  ensureMarkers(512);
  const groupSize = (scale: number): [
    number,
    number
  ] => [
    Math.max(1, Math.round(output.size[0] * scale)),
    Math.max(1, Math.round(output.size[1] * scale))
  ];
  const groups = LAYER_SCALES.map((scale, index) => ({
    scale,
    layer: target(instance, { size: groupSize(scale), format: 'rgba16float', depth: 'depth32float' }),
    shaded: target(instance, { size: groupSize(scale), format: 'rgba16float' }),
    temp: target(instance, { size: index === 0 ? [1, 1] : groupSize(scale), format: 'rgba16float' }),
    blurred: target(instance, { size: index === 0 ? [1, 1] : groupSize(scale), format: 'rgba16float' }),
    softReady: index !== 0
  }));
  const layerParams = DEPTHS.map(() => uniforms(instance, { view: [1, 1, 1, 0], look: [0.7, 0, 0, 0] }));
  const spreadX = DEPTHS.map(() => uniforms(instance, { texel: [0, 0, 0, 0] }));
  const spreadY = DEPTHS.map(() => uniforms(instance, { texel: [0, 0, 0, 0] }));
  const mixParams = DEPTHS.map(() => uniforms(instance, { info: [1, 0, 0, 0] }));
  const shadeParams = DEPTHS.map(() => uniforms(instance, { info: [0, 0, 0, 0], more: [0, 0, 0, 0] }));
  const shardSolid = DEPTHS.map((_, level) => draw(instance, {
    shader: SHARD_SHADER,
    entry: { fragment: 'fs_solid' },
    vertices: 6,
    cull: 'none',
    depth: { write: true, compare: 'less' },
    label: `aero-shards-solid-${level}`
  }));
  const shardEdge = DEPTHS.map((_, level) => draw(instance, {
    shader: SHARD_SHADER,
    entry: { fragment: 'fs_edge' },
    vertices: 6,
    cull: 'none',
    depth: { write: false, compare: 'less' },
    blend: 'premultiplied',
    label: `aero-shards-edge-${level}`
  }));
  const layerPasses = DEPTHS.map((_, level) => groups.map((group, index) => ({
    shadow: effect(instance, SHADOW_SHADER, {
      label: `aero-shards-shadow-${level}-${index}`,
      set: { source: group.layer, depthMap: group.layer.depth, shadeInfo: shadeParams[level] }
    }),
    blurX: effect(instance, LAYER_BLUR_SHADER, {
      label: `aero-shards-depth-x-${level}-${index}`,
      set: { source: group.shaded, linearSampler: linear, spreadInfo: spreadX[level] }
    }),
    blurY: effect(instance, LAYER_BLUR_SHADER, {
      label: `aero-shards-depth-y-${level}-${index}`,
      set: { source: group.temp, linearSampler: linear, spreadInfo: spreadY[level] }
    }),
    sharp: effect(instance, COMPOSITE_SHADER, {
      label: `aero-shards-sharp-${level}-${index}`,
      blend: 'premultiplied',
      set: { source: group.shaded, linearSampler: linear, mixInfo: mixParams[level] }
    }),
    soft: effect(instance, COMPOSITE_SHADER, {
      label: `aero-shards-soft-${level}-${index}`,
      blend: 'premultiplied',
      set: { source: group.blurred, linearSampler: linear, mixInfo: mixParams[level] }
    })
  })));
  let capacity = 0;
  let shardBuffer: ReturnType<typeof storage> | null = null;
  let upload = new Float32Array(0);
  let staging = new Float32Array(0);
  let depths = new Float32Array(0);
  const ensureCapacity = (needed: number) => {
    if (needed <= capacity && shardBuffer)
      return;
    capacity = Math.max(needed, 256);
    upload = new Float32Array(capacity * FLOATS);
    staging = new Float32Array(capacity * FLOATS);
    depths = new Float32Array(capacity);
    shardBuffer = storage(instance, upload.byteLength, 'read');
    DEPTHS.forEach((_, level) => {
      shardSolid[level].set({ scene: frameParams, shards: shardBuffer, layerInfo: layerParams[level] });
      shardEdge[level].set({ scene: frameParams, shards: shardBuffer, layerInfo: layerParams[level] });
    });
  };
  ensureCapacity(settingsRef.current.count);
  const passes = levels.map((level, index) => {
    const source = index === 0 ? scene : levels[index - 1].main;
    const downParams = uniforms(instance, { texel: [0, 0, 0, 0] });
    const horizontalParams = uniforms(instance, { texel: [0, 0, 0, 0] });
    const verticalParams = uniforms(instance, { texel: [0, 0, 0, 0] });
    return {
      source,
      level,
      downParams,
      horizontalParams,
      verticalParams,
      down: effect(instance, index === 0 ? PREFILTER_SHADER : DOWNSAMPLE_SHADER, {
        label: `aero-shards-down-${index}`,
        set: { source, linearSampler: linear, bloom: downParams }
      }),
      horizontal: effect(instance, BLUR_SHADER, {
        label: `aero-shards-blur-x-${index}`,
        set: { source: level.main, linearSampler: linear, bloom: horizontalParams }
      }),
      vertical: effect(instance, BLUR_SHADER, {
        label: `aero-shards-blur-y-${index}`,
        set: { source: level.spare, linearSampler: linear, bloom: verticalParams }
      })
    };
  });
  const finishParams = uniforms(instance, { info: [0, 0, 0, 1], paper: [0, 0, 0, 0], mode: [0, 0, 0, 0] });
  const finish = effect(instance, FINISH_SHADER, {
    label: 'aero-shards-finish',
    set: {
      sceneTexture: scene,
      linearSampler: linear,
      bloom0: levels[0].main,
      bloom1: levels[1].main,
      bloom2: levels[2].main,
      bloom3: levels[3].main,
      finish: finishParams
    }
  });
  await Promise.all([
    ...shardSolid.map(item => item.compile(groups[0].layer)),
    ...shardEdge.map(item => item.compile(groups[0].layer)),
    ...layerPasses.flatMap(list => list.flatMap((item, index) => [
      item.shadow.compile(groups[index].shaded),
      item.blurX.compile(groups[index].temp),
      item.blurY.compile(groups[index].blurred),
      item.sharp.compile(scene),
      item.soft.compile(scene)
    ])),
    markerDraw.compile(scene),
    finish.compile({ colors: [format] }),
    ...passes.flatMap((pass, index) => [
      pass.down.compile(levels[index].main),
      pass.horizontal.compile(levels[index].spare),
      pass.vertical.compile(levels[index].main)
    ])
  ]);
  return { sizeFor, output, scene, groupSize, levelSize, groups, levels, frameParams, markerDraw, ensureMarkers, layerParams, spreadX, spreadY, mixParams, shadeParams, shardSolid, shardEdge, layerPasses, ensureCapacity, passes, finishParams, finish,
    get markerCapacity() { return markerCapacity; },
    get markerBuffer() { return markerBuffer; },
    get markerData() { return markerData; },
    get shardBuffer() { return shardBuffer; },
    get upload() { return upload; },
    get staging() { return staging; },
    get depths() { return depths; }
  };
}
export type AeroResources = Awaited<ReturnType<typeof createAeroResources>>;
