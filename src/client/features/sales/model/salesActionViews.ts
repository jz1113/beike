import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';

export const POSE_ANGLE_ORDER = ['front', 'diagonal', 'side', 'high', 'low'] as const;

export const POSE_ANGLE_SHORT_LABELS: Record<string, string> = {
  front: '正',
  diagonal: '斜',
  side: '侧',
  high: '俯',
  low: '仰',
};

export const POSE_ANGLE_FULL_LABELS: Record<string, string> = {
  front: '正面平视',
  diagonal: '斜侧 45°',
  side: '侧面 90°',
  high: '俯视机位',
  low: '仰视机位',
};

export interface ActionAngleEntry {
  angle: string;
  shortLabel: string;
  label: string;
  url: string;
  isDefault: boolean;
}

export function extractActionAngleEntries(input: {
  dimensions?: string;
  sourceImages?: readonly string[];
  coverUrl?: string;
  mediaUrl?: string;
}): ActionAngleEntry[] {
  const dims = audienceDimensions(input.dimensions);
  const rawViews = dims.actionViews;
  const primaryUrl = (input.mediaUrl || input.coverUrl || '').trim();
  const explicitDefault = typeof dims.defaultAngle === 'string' ? dims.defaultAngle.trim() : '';

  if (rawViews && typeof rawViews === 'object' && !Array.isArray(rawViews)) {
    const viewMap = rawViews as Record<string, unknown>;
    const entries: ActionAngleEntry[] = [];
    const seenAngles = new Set<string>();

    const appendAngle = (angle: string) => {
      const val = viewMap[angle];
      if (typeof val !== 'string' || !val.trim() || seenAngles.has(angle)) return;
      seenAngles.add(angle);
      const url = val.trim();
      const isDefault = explicitDefault ? angle === explicitDefault : url === primaryUrl;
      entries.push({
        angle,
        shortLabel: POSE_ANGLE_SHORT_LABELS[angle] || angle.slice(0, 2).toUpperCase(),
        label: POSE_ANGLE_FULL_LABELS[angle] || angle,
        url,
        isDefault,
      });
    };

    for (const angle of POSE_ANGLE_ORDER) {
      appendAngle(angle);
    }
    for (const angle of Object.keys(viewMap)) {
      appendAngle(angle);
    }
    if (entries.length > 0 && !entries.some((item) => item.isDefault)) {
      entries[0] = { ...entries[0], isDefault: true };
    }
    if (entries.length > 1) return entries;
  }

  const sources = (input.sourceImages || []).map((item) => item.trim()).filter(Boolean);
  if (sources.length > 1) {
    return sources.map((url, idx) => {
      const fallbackAngle = POSE_ANGLE_ORDER[idx] || `view_${idx + 1}`;
      return {
        angle: fallbackAngle,
        shortLabel: `${idx + 1}`,
        label: `视角 ${idx + 1}`,
        url,
        isDefault: primaryUrl ? url === primaryUrl : idx === 0,
      };
    });
  }
  return [];
}

export function buildActionDefaultAnglePatch(
  existingDimensions: string | undefined,
  angle: string,
  url: string,
): { coverUrl: string; mediaUrl: string; dimensions: string } {
  const dims = audienceDimensions(existingDimensions);
  const rawViews = dims.actionViews && typeof dims.actionViews === 'object' && !Array.isArray(dims.actionViews)
    ? { ...(dims.actionViews as Record<string, unknown>), [angle]: url }
    : { [angle]: url };
  const nextDimensions = JSON.stringify({
    ...dims,
    defaultAngle: angle,
    actionViews: rawViews,
  });
  return {
    coverUrl: url,
    mediaUrl: url,
    dimensions: nextDimensions,
  };
}

