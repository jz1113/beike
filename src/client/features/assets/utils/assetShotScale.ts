interface ShotScaleAsset {
  tags?: unknown;
  shotType?: unknown;
  title?: unknown;
  name?: unknown;
  description?: unknown;
  action?: unknown;
}

export function isMacroOrCloseUp(item: ShotScaleAsset): boolean {
  const tagsStr = String(item.tags || '');
  if (tagsStr.includes('半身姿态') || tagsStr.includes('全身氛围')) return false;

  const shotTypeLower = String(item.shotType || '').toLowerCase();
  // 1. 如果明确指定了半身或全身，绝对不能归入微距/特写！
  if (
    shotTypeLower === 'half_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction') ||
    shotTypeLower.includes('lifestyle_interaction') ||
    shotTypeLower === 'full_body' ||
    shotTypeLower.includes('full') ||
    shotTypeLower.includes('whole')
  ) {
    return false;
  }
  if (
    shotTypeLower === 'macro' ||
    shotTypeLower === 'close_up' ||
    shotTypeLower.includes('closeup') ||
    shotTypeLower.includes('macro')
  ) {
    return true;
  }

  // 2. 如果动作名称或标签明确提到局部特写
  const title = String(item.title || item.name || '').toLowerCase();
  const desc = String(item.description || item.action || '').toLowerCase();
  if (title.includes('特写') || title.includes('微距') || desc.includes('特写') || desc.includes('微距')) {
    return true;
  }

  return false;
}

export function isHalfBody(item: ShotScaleAsset): boolean {
  if (isMacroOrCloseUp(item)) return false;
  const tagsStr = String(item.tags || '');
  if (tagsStr.includes('半身姿态')) return true;
  if (tagsStr.includes('全身氛围')) return false;

  const shotTypeLower = String(item.shotType || '').toLowerCase();
  if (
    shotTypeLower === 'half_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction') ||
    shotTypeLower.includes('lifestyle_interaction')
  ) {
    return true;
  }

  const title = String(item.title || item.name || '').toLowerCase();
  const desc = String(item.description || item.action || '').toLowerCase();
  if (title.includes('半身') || desc.includes('半身') || title.includes('坐姿') || title.includes('倚靠')) {
    return true;
  }

  return false;
}

export function isFullBody(item: ShotScaleAsset): boolean {
  if (isMacroOrCloseUp(item)) return false;
  if (isHalfBody(item)) return false;
  return true;
}
