"""Depth normalization, polarity and visualization styles."""

from __future__ import annotations

from depth_runtime import PostProcessConfig, cv2, np


def normalize_depth(depth: "np.ndarray") -> "np.ndarray":
    assert np is not None
    lo, hi = np.percentile(depth, [2, 98])
    if hi <= lo:
        hi = lo + 1e-6
    norm = np.clip((depth.astype(np.float32) - lo) / (hi - lo), 0.0, 1.0)
    return norm


def smoothstep(edge0: float, edge1: float, values: "np.ndarray") -> "np.ndarray":
    assert np is not None
    span = max(edge1 - edge0, 1e-6)
    t = np.clip((values - edge0) / span, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def correct_polarity(near: "np.ndarray") -> "np.ndarray":
    """Ensure center subject is brighter than border background."""
    assert np is not None
    height, width = near.shape
    cy0, cy1 = int(height * 0.25), int(height * 0.75)
    cx0, cx1 = int(width * 0.25), int(width * 0.75)
    center_mean = float(near[cy0:cy1, cx0:cx1].mean())
    border = np.concatenate([
        near[: max(1, int(height * 0.1)), :].ravel(),
        near[-max(1, int(height * 0.1)) :, :].ravel(),
        near[:, : max(1, int(width * 0.1))].ravel(),
        near[:, -max(1, int(width * 0.1)) :].ravel(),
    ])
    border_mean = float(border.mean()) if border.size else center_mean
    if center_mean < border_mean:
        return 1.0 - near
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
) -> "np.ndarray":
    """LibTV-like motion capture: bright subject with body gradients on black background."""
    assert cv2 is not None and np is not None
    cfg = post_process or PostProcessConfig()
    norm = normalize_depth(depth)
    near = 1.0 - norm
    if invert_depth:
        near = 1.0 - near
    near = correct_polarity(near)

    scaled = (near * 255.0).astype(np.float32)
    if cfg.bilateral_d > 0:
        smoothed = cv2.bilateralFilter(
            scaled,
            d=cfg.bilateral_d,
            sigmaColor=cfg.bilateral_sigma,
            sigmaSpace=cfg.bilateral_sigma,
        ) / 255.0
    else:
        smoothed = scaled / 255.0

    t_low = float(np.percentile(smoothed, 18))
    t_high = float(np.percentile(smoothed, 55))
    fg_weight = smoothstep(t_low, t_high, smoothed)

    bg_low = float(np.percentile(smoothed, 8))
    bg_high = float(np.percentile(smoothed, 22))
    bg_weight = 1.0 - smoothstep(bg_low, bg_high, smoothed)

    out = smoothed * fg_weight
    out = out * (1.0 - 0.85 * bg_weight)
    out = np.power(np.clip(out, 0.0, 1.0), cfg.gamma)

    lo, hi = np.percentile(out, [cfg.stretch_lo, cfg.stretch_hi])
    if hi <= lo:
        hi = lo + 1e-6
    out = np.clip((out - lo) / (hi - lo), 0.0, 1.0)
    gray = (out * 255).astype(np.uint8)

    if cfg.sharpen:
        gray = apply_unsharp_mask(gray, radius=cfg.sharpen_radius, amount=cfg.sharpen_amount)
    return gray


def to_raw_style(depth: "np.ndarray", post_process: PostProcessConfig | None = None) -> "np.ndarray":
    assert np is not None
    cfg = post_process or PostProcessConfig()
    norm = normalize_depth(depth)
    gray = (norm * 255).astype(np.uint8)
    if cfg.sharpen:
        gray = apply_unsharp_mask(gray, radius=cfg.sharpen_radius, amount=cfg.sharpen_amount)
    return gray


def apply_style(
    depth: "np.ndarray",
    style: str,
    invert_depth: bool = False,
    post_process: PostProcessConfig | None = None,
) -> "np.ndarray":
    assert cv2 is not None and np is not None
    if style == "mocap":
        gray = to_mocap_style(depth, invert_depth=invert_depth, post_process=post_process)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if style == "raw":
        gray = to_raw_style(depth, post_process=post_process)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    if style == "turbo":
        gray = to_raw_style(depth, post_process=post_process)
        return cv2.applyColorMap(gray, cv2.COLORMAP_TURBO)
    raise ValueError(f"未知 style: {style}")
