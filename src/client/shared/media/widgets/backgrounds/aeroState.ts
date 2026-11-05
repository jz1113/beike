import { Ring, PLACEMENTS, LEVELS, createShards, AeroSettings } from './aeroShardModel';
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
    seen: null as AeroSettings | null
  };
}
export type AeroState = ReturnType<typeof createAeroState>;
