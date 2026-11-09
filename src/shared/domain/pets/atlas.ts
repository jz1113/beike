export const PET_CELL = { width: 192, height: 208 } as const;
export const PET_COLUMNS = 8;

export type PetSpriteVersion = 1 | 2;
export type PetPose = 'idle' | 'working' | 'success' | 'failed' | 'look';

interface PoseRow {
  row: number;
  durations: number[];
}

const rows: Record<Exclude<PetPose, 'look'>, PoseRow> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  working: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  success: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
};

export function petFrame(pose: PetPose, version: PetSpriteVersion, elapsedMs: number, lookIndex: number | null) {
  if (pose === 'look' && version === 2 && lookIndex !== null) {
    const index = ((lookIndex % 16) + 16) % 16;
    return index < 8 ? { row: 9, column: index } : { row: 10, column: index - 8 };
  }
  const motion = rows[pose === 'look' ? 'idle' : pose];
  const total = motion.durations.reduce((sum, value) => sum + value, 0);
  let cursor = ((elapsedMs % total) + total) % total;
  let column = 0;
  for (let index = 0; index < motion.durations.length; index += 1) {
    column = index;
    if (cursor < motion.durations[index]) break;
    cursor -= motion.durations[index];
  }
  return { row: motion.row, column };
}

export function pointerLookIndex(dx: number, dy: number, deadzone: number) {
  if (Math.hypot(dx, dy) < deadzone) return null;
  const degrees = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return Math.round(degrees / 22.5) % 16;
}

export function petSheetSize(version: PetSpriteVersion) {
  return { width: PET_COLUMNS * PET_CELL.width, height: (version === 2 ? 11 : 9) * PET_CELL.height };
}

const feedPoses: Record<string, PetPose> = {
  dragging: 'working',
  uploading: 'working',
  analyzing: 'working',
  success: 'success',
  partial: 'failed',
  error: 'failed',
};

export function resolvePetPose(input: {
  preview?: PetPose | null;
  feedPhase?: string | null;
  flash?: PetPose | null;
  busy?: boolean;
}): PetPose {
  if (input.preview) return input.preview;
  const fed = input.feedPhase ? feedPoses[input.feedPhase] : undefined;
  if (fed) return fed;
  if (input.flash) return input.flash;
  if (input.busy) return 'working';
  return 'idle';
}

const petCommand = /^npx\s+codex-pets\s+add\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/;
const shellNoise = /[|&;`$<>(){}\\]|\s(?:&&|\|\|)\s/;

export interface ParsedPetCommand {
  input: string;
  id?: string;
  error?: string;
}

export function parsePetCommands(text: string): ParsedPetCommand[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((input) => {
    if (shellNoise.test(input)) return { input, error: '只接受 npx codex-pets add 宠物标识' };
    const match = petCommand.exec(input);
    if (!match) return { input, error: '只接受 npx codex-pets add 宠物标识' };
    return { input, id: match[1] };
  });
}
