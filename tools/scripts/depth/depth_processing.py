"""Depth normalization, polarity and visualization styles."""

from __future__ import annotations

from depth_runtime import PostProcessConfig, cv2, np


def _fast_percentile(values: "np.ndarray", q: list[float] | float) -> "np.ndarray":
    assert np is not None
    height, width = values.shape[:2]
    pixels = height * width
    step = 4 if pixels >= 300_000 else (2 if pixels >= 80_000 else 1)
    sample = values[::step, ::step] if step > 1 else values
    return np.percentile(sample, q)


def normalize_depth(depth: "np.ndarray") -> "np.ndarray":
    assert np is not None
    lo, hi = [float(v) for v in _fast_percentile(depth, [2, 98])]
    if hi <= lo:
        hi = lo + 1e-6
    inv_span = np.float32(1.0 / (hi - lo))
    norm = np.clip((depth.astype(np.float32, copy=False) - np.float32(lo)) * inv_span, np.float32(0.0), np.float32(1.0))
    return norm


def smoothstep(edge0: float, edge1: float, values: "np.ndarray") -> "np.ndarray":
    assert np is not None
    span = max(edge1 - edge0, 1e-6)
    inv_span = np.float32(1.0 / span)
    t = np.clip((values - np.float32(edge0)) * inv_span, np.float32(0.0), np.float32(1.0))
    return t * t * (np.float32(3.0) - np.float32(2.0) * t)


def correct_polarity(near: "np.ndarray") -> "np.ndarray":
    """Ensure center subject is brighter than border background."""
    assert np is not None
    height, width = near.shape
    cy0, cy1 = int(height * 0.25), int(height * 0.75)
    cx0, cx1 = int(width * 0.25), int(width * 0.75)
    center_mean = float(near[cy0:cy1, cx0:cx1].mean())
    bh = max(1, int(height * 0.1))
    bw = max(1, int(width * 0.1))
    border_sum = float(
        near[:bh, :].sum()
        + near[-bh:, :].sum()
        + near[:, :bw].sum()
        + near[:, -bw:].sum()
    )
    border_count = 2 * bh * width + 2 * bw * height
    border_mean = border_sum / border_count if border_count else center_mean
    if center_mean < border_mean:
        return np.float32(1.0) - near
    return near


def apply_unsharp_mask(gray: "np.ndarray", radius: float = 1.0, amount: float = 0.6) -> "np.ndarray":
    assert cv2 is not None and np is not None
    blurred = cv2.GaussianBlur(gray, (0, 0), radius)
    sharpened = cv2.addWeighted(gray, 1.0 + amount, blurred, -amount, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def to_mocap_style(
    depth: "np.ndarray",
    invert_depth: bool = False,
    post_process: PostProcessConfig | None = None,
    subject_mask: "np.ndarray | None" = None,
) -> "np.ndarray":
    """LibTV-like motion capture: bright subject with body gradients on black background."""
    assert cv2 is not None and np is not None
    cfg = post_process or PostProcessConfig()
    norm = normalize_depth(depth)
    near = norm if invert_depth else (np.float32(1.0) - norm)
    near = correct_polarity(near)

    scaled = (near * np.float32(255.0)).astype(np.float32, copy=False)
    if cfg.bilateral_d > 0:
        smoothed = cv2.bilateralFilter(
            scaled,
            d=cfg.bilateral_d,
            sigmaColor=cfg.bilateral_sigma,
            sigmaSpace=cfg.bilateral_sigma,
        ) * np.float32(1.0 / 255.0)
    else:
        smoothed = near

    if subject_mask is not None:
        matte = trim_depth_spill(smoothed, subject_mask)
        return render_subject_depth(smoothed, restore_depth_regions(smoothed, matte), cfg)

    bg_low, t_low, bg_high, t_high = [float(v) for v in _fast_percentile(smoothed, [8, 18, 22, 55])]
    fg_weight = smoothstep(t_low, t_high, smoothed)
    bg_weight = np.float32(1.0) - smoothstep(bg_low, bg_high, smoothed)

    out = smoothed * fg_weight * (np.float32(1.0) - np.float32(0.85) * bg_weight)
    out = np.power(np.clip(out, np.float32(0.0), np.float32(1.0)), np.float32(cfg.gamma))

    lo, hi = [float(v) for v in _fast_percentile(out, [cfg.stretch_lo, cfg.stretch_hi])]
    if hi <= lo:
        hi = lo + 1e-6
    inv_span = np.float32(1.0 / (hi - lo))
    out = np.clip((out - np.float32(lo)) * inv_span, np.float32(0.0), np.float32(1.0))
    gray = (out * np.float32(255.0)).astype(np.uint8)

    if cfg.sharpen:
        gray = apply_unsharp_mask(gray, radius=cfg.sharpen_radius, amount=cfg.sharpen_amount)
    return gray


def trim_depth_spill(near: "np.ndarray", mask: "np.ndarray") -> "np.ndarray":
    """Suppress border leaks only where the subject separates from the surrounding scene."""
    if not np.any(mask) or np.all(mask >= 0.99):
        return mask
    # Compare within rows: ground depth changes rapidly from horizon to feet.
    step = max(1, near.shape[1] // 160)
    sample = near[:, ::step]
    alpha = mask[:, ::step]
    valid = np.any(alpha > 0.8, axis=1) & np.any(alpha < 0.02, axis=1)
    if not np.any(valid):
        return mask
    fg = np.nanpercentile(np.where(alpha[valid] > 0.8, sample[valid], np.nan), 70, axis=1)
    bg = np.nanmedian(np.where(alpha[valid] < 0.02, sample[valid], np.nan), axis=1)
    gap = fg - bg
    # Protect interior pixels and avoid cutting silhouettes against similar-depth backgrounds.
    radius = max(2, round(min(mask.shape) * 0.012))
    interior = cv2.distanceTransform((mask > 0.5).astype(np.uint8), cv2.DIST_L2, 3)
    relative = (near[valid] - bg[:, None]) / np.where(np.abs(gap) > 0.06, gap, 1)[:, None]
    weight = np.clip((relative - 0.25) / 0.30, 0, 1)
    weight = np.where((np.abs(gap) > 0.06)[:, None], weight, 1)
    trimmed = mask.copy()
    trimmed[valid] *= np.maximum(weight, np.clip(interior[valid] / radius, 0, 1))
    return trimmed


def restore_depth_regions(near: "np.ndarray", matte: "np.ndarray") -> "np.ndarray":
    """Recover semantic dropouts with connected same-frame depth, preserving true gaps."""
    binary = (matte > 0.5).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    repaired = matte.copy()
    height, width = near.shape
    for index in range(1, count):
        x, y, w, h, area = stats[index]
        if area < max(24, height * width * 0.0005):
            continue
        # Search the silhouette envelope. Compare with the surrounding scene
        # on the same scanline, so floor gradients cannot flood into the body.
        pad = max(2, round(w * 0.15))
        left, right = max(0, x - pad), min(width, x + w + pad)
        rows = slice(y, y + h)
        surroundings = np.concatenate((near[rows, :left:4], near[rows, right::4]), axis=1)
        if surroundings.shape[1] < 4:
            continue
        background = np.median(surroundings, axis=1)
        region = near[rows, left:right]
        seed = labels[rows, left:right] == index
        valid = np.any(seed, axis=1)
        level = np.nanmedian(np.where(seed[valid], region[valid], np.nan), axis=1)
        subject = np.interp(np.arange(h), np.flatnonzero(valid), level)
        gap = subject - background
        relative = (region - background[:, None]) / np.where(np.abs(gap) > 0.14, gap, 1)[:, None]
        evidence = np.clip((relative - 0.62) / 0.24, 0, 1)
        evidence[np.abs(gap) <= 0.14] = 0
        # A real opening (for example between arm and waist) stays at background depth.
        _, regions = cv2.connectedComponents(((evidence > 0) | seed).astype(np.uint8))
        supported = np.isin(regions, np.unique(regions[seed]))
        patch = repaired[rows, left:right]
        np.maximum(patch, evidence * supported, out=patch)
    return repaired


def render_subject_depth(near: "np.ndarray", mask: "np.ndarray", cfg: PostProcessConfig) -> "np.ndarray":
    """Map normalized scene depth to a bright, low-contrast motion silhouette."""
    assert cv2 is not None and np is not None
    # A fixed curve avoids making slight gestures redistribute all body tones.
    gray = np.rint(216 + 38 * np.sqrt(np.clip(near, 0.0, 1.0))).astype(np.uint8)
    if cfg.sharpen:
        gray = apply_unsharp_mask(gray, radius=cfg.sharpen_radius, amount=cfg.sharpen_amount)
    # Apply the matte last: sharpening must never create halos in the background.
    return (gray.astype(np.float32) * np.clip(mask, 0.0, 1.0)).astype(np.uint8)


def to_raw_style(depth: "np.ndarray", post_process: PostProcessConfig | None = None) -> "np.ndarray":
    assert np is not None
    cfg = post_process or PostProcessConfig()
    norm = normalize_depth(depth)
    gray = (norm * np.float32(255.0)).astype(np.uint8)
    if cfg.sharpen:
        gray = apply_unsharp_mask(gray, radius=cfg.sharpen_radius, amount=cfg.sharpen_amount)
    return gray


def apply_style(
    depth: "np.ndarray",
    style: str,
    invert_depth: bool = False,
    post_process: PostProcessConfig | None = None,
    subject_mask: "np.ndarray | None" = None,
) -> "np.ndarray":
    assert cv2 is not None and np is not None
    if style == "mocap":
        gray = to_mocap_style(depth, invert_depth=invert_depth, post_process=post_process, subject_mask=subject_mask)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if style == "raw":
        gray = to_raw_style(depth, post_process=post_process)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if style == "turbo":
        gray = to_raw_style(depth, post_process=post_process)
        return cv2.applyColorMap(gray, cv2.COLORMAP_TURBO)
    raise ValueError(f"未知 style: {style}")
