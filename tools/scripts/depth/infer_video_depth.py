#!/usr/bin/env python3
"""Monocular depth estimation with motion-capture style visualization."""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import cv2
    import numpy as np
    from PIL import Image
    from scipy.ndimage import median_filter
except ImportError:  # pragma: no cover
    cv2 = None
    np = None
    median_filter = None

DEFAULT_DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Base-hf"


@dataclass(frozen=True)
class PostProcessConfig:
    bilateral_d: int = 5
    bilateral_sigma: int = 12
    sharpen: bool = False
    sharpen_radius: float = 1.0
    sharpen_amount: float = 0.6
    temporal_window: int = 3
    gamma: float = 0.62
    stretch_lo: float = 1.0
    stretch_hi: float = 99.0


QUALITY_PROFILES: dict[str, tuple[str, PostProcessConfig, dict[str, int]]] = {
    "fast": (
        "depth-anything/Depth-Anything-V2-Small-hf",
        PostProcessConfig(bilateral_d=5, bilateral_sigma=12, temporal_window=3),
        {"default": 518, "cuda": 518, "mps": 518, "cpu": 518},
    ),
    "standard": (
        "depth-anything/Depth-Anything-V2-Base-hf",
        PostProcessConfig(bilateral_d=5, bilateral_sigma=12, temporal_window=3),
        {"default": 518, "cuda": 518, "mps": 518, "cpu": 518},
    ),
    "high": (
        "depth-anything/Depth-Anything-V2-Large-hf",
        PostProcessConfig(
            bilateral_d=0,
            bilateral_sigma=6,
            sharpen=True,
            sharpen_radius=1.5,
            sharpen_amount=1.0,
            temporal_window=1,
            gamma=0.78,
            stretch_lo=2.0,
            stretch_hi=98.0,
        ),
        {"default": 768, "cuda": 1024, "mps": 768, "cpu": 518},
    ),
}


@dataclass
class DepthRuntime:
    model: Any
    processor: Any
    device: str
    inference_size: int
    model_id: str


def resolve_quality_profile(quality: str) -> tuple[str, PostProcessConfig, dict[str, int]]:
    if quality not in QUALITY_PROFILES:
        return QUALITY_PROFILES["standard"]
    return QUALITY_PROFILES[quality]


def emit_progress(frame: int, total: int) -> None:
    print(json.dumps({"type": "progress", "frame": frame, "total": total}), flush=True)


def emit_meta(model_id: str, inference_size: int, device: str, quality: str) -> None:
    print(json.dumps({
        "type": "meta",
        "modelId": model_id,
        "inferenceSizePx": inference_size,
        "device": device,
        "quality": quality,
    }), flush=True)


def resolve_device(device: str) -> str:
    import torch

    if device != "auto":
        return device
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def resolve_inference_size(
    quality: str,
    device: str,
    size_map: dict[str, int],
    override: int = 0,
) -> int:
    if override > 0:
        return override
    return size_map.get(device, size_map.get("default", 518))


def load_depth_runtime(device: str, model_id: str, inference_size: int) -> DepthRuntime:
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    resolved = resolve_device(device)
    torch_device = torch.device("cuda:0" if resolved == "cuda" else resolved)
    processor = AutoImageProcessor.from_pretrained(
        model_id,
        size={"height": inference_size, "width": inference_size},
        use_fast=True,
    )
    model = AutoModelForDepthEstimation.from_pretrained(model_id)
    model.to(torch_device)
    model.eval()
    return DepthRuntime(
        model=model,
        processor=processor,
        device=str(torch_device),
        inference_size=inference_size,
        model_id=model_id,
    )


def infer_depth(image: Image.Image, runtime: DepthRuntime) -> "np.ndarray":
    import torch

    inputs = runtime.processor(images=image, return_tensors="pt")
    inputs = {key: value.to(runtime.device) for key, value in inputs.items()}
    with torch.no_grad():
        outputs = runtime.model(**inputs)
    post = runtime.processor.post_process_depth_estimation(
        outputs,
        target_sizes=[(image.height, image.width)],
    )
    return post[0]["predicted_depth"].detach().cpu().numpy().astype(np.float32)


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


def temporal_median(depth_maps: list["np.ndarray"], index: int, window: int = 3) -> "np.ndarray":
    assert np is not None
    if window <= 1:
        return depth_maps[index].astype(np.float32)
    half = window // 2
    start = max(0, index - half)
    end = min(len(depth_maps), index + half + 1)
    stack = np.stack(depth_maps[start:end], axis=0)
    return np.median(stack, axis=0).astype(np.float32)


def infer_frames(
    input_dir: Path,
    output_dir: Path,
    style: str,
    device: str,
    mode: str,
    model_id: str,
    quality: str,
    inference_size: int,
    invert_depth: bool = False,
    post_process: PostProcessConfig | None = None,
) -> None:
    if cv2 is None or np is None or median_filter is None:
        raise RuntimeError("缺少 opencv / numpy / scipy，请执行 pip install -r requirements.txt")

    cfg = post_process or PostProcessConfig()
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_files = sorted(input_dir.glob("*.png"))
    if not frame_files:
        raise RuntimeError(f"输入目录无 PNG 帧: {input_dir}")

    if mode == "stub":
        for index, frame_path in enumerate(frame_files, start=1):
            frame = cv2.imread(str(frame_path))
            if frame is None:
                raise RuntimeError(f"无法读取帧: {frame_path}")
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            cv2.imwrite(str(output_dir / frame_path.name), cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))
            emit_progress(index, len(frame_files))
        return

    resolved_device = resolve_device(device)
    runtime = load_depth_runtime(device, model_id, inference_size)
    emit_meta(model_id, inference_size, resolved_device, quality)

    # Keep only the temporal window in memory.  The previous implementation
    # retained every full-resolution float32 depth map until inference had
    # finished.  A 30 s / 30 fps / 1280x720 clip can exceed 3 GiB before the
    # model and video frames are counted, and concurrent jobs multiply that
    # cost.  A small indexed ring gives the same centred temporal median while
    # keeping memory O(window) instead of O(frame_count).
    total = len(frame_files)
    half_window = max(0, cfg.temporal_window // 2)
    recent_depths: dict[int, np.ndarray] = {}
    next_output_index = 0

    for frame_index, frame_path in enumerate(frame_files):
        frame = cv2.imread(str(frame_path))
        if frame is None:
            raise RuntimeError(f"无法读取帧: {frame_path}")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        recent_depths[frame_index] = infer_depth(Image.fromarray(rgb), runtime)

        is_last_frame = frame_index == total - 1
        while next_output_index < total:
            required_right = min(total - 1, next_output_index + half_window)
            if not is_last_frame and frame_index < required_right:
                break

            window_start = max(0, next_output_index - half_window)
            window_end = min(total, next_output_index + half_window + 1)
            window_maps = [recent_depths[i] for i in range(window_start, window_end)]
            if len(window_maps) == 1:
                stable_depth = window_maps[0].astype(np.float32, copy=False)
            else:
                stable_depth = np.median(np.stack(window_maps, axis=0), axis=0).astype(np.float32)

            output_frame = frame_files[next_output_index]
            vis = apply_style(stable_depth, style, invert_depth=invert_depth, post_process=cfg)
            cv2.imwrite(str(output_dir / output_frame.name), vis)
            emit_progress(next_output_index + 1, total)
            next_output_index += 1

            earliest_needed = max(0, next_output_index - half_window)
            for old_index in [i for i in recent_depths if i < earliest_needed]:
                del recent_depths[old_index]


def infer_single_image(
    input_path: Path,
    output_path: Path,
    style: str,
    device: str,
    model_id: str,
    quality: str,
    inference_size: int,
    invert_depth: bool = False,
    post_process: PostProcessConfig | None = None,
) -> None:
    if cv2 is None or np is None:
        raise RuntimeError("缺少 opencv / numpy，请执行 pip install -r requirements.txt")

    frame = cv2.imread(str(input_path))
    if frame is None:
        raise RuntimeError(f"无法读取图片: {input_path}")

    resolved_device = resolve_device(device)
    runtime = load_depth_runtime(device, model_id, inference_size)
    emit_meta(model_id, inference_size, resolved_device, quality)

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    depth = infer_depth(Image.fromarray(rgb), runtime)
    vis = apply_style(depth, style, invert_depth=invert_depth, post_process=post_process)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), vis)
    emit_progress(1, 1)


def check_env() -> int:
    details = {
        "opencv": cv2 is not None,
        "numpy": np is not None,
        "scipy": median_filter is not None,
        "torch": False,
        "transformers": False,
        "depthModelReady": False,
    }
    try:
        import torch  # noqa: F401
        details["torch"] = True
    except ImportError:
        pass
    try:
        import transformers  # noqa: F401
        details["transformers"] = True
    except ImportError:
        pass

    details["depthModelReady"] = bool(
        details["opencv"]
        and details["numpy"]
        and details["scipy"]
        and details["torch"]
        and details["transformers"]
    )
    print(json.dumps(details))
    return 0 if details["depthModelReady"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Infer depth motion-capture frames")
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--input-image", type=Path)
    parser.add_argument("--output-image", type=Path)
    parser.add_argument("--style", choices=["mocap", "turbo", "raw"], default="mocap")
    parser.add_argument("--colormap", choices=["gray", "turbo"], default=None, help=argparse.SUPPRESS)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--model", default=None, help="HuggingFace depth model id")
    parser.add_argument("--quality", choices=["fast", "standard", "high"], default="standard")
    parser.add_argument("--inference-size", type=int, default=0, help="0 = auto by quality/device")
    parser.add_argument("--invert-depth", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--mode", choices=["auto", "stub"], default="auto")
    parser.add_argument("--check-env", action="store_true")
    args = parser.parse_args()

    if args.check_env:
        return check_env()

    style = args.style
    if args.colormap == "turbo":
        style = "turbo"
    elif args.colormap == "gray":
        style = "mocap"

    profile_model, post_process, size_map = resolve_quality_profile(args.quality)
    model_id = args.model or profile_model
    resolved_device = resolve_device(args.device)
    inference_size = resolve_inference_size(
        args.quality,
        resolved_device,
        size_map,
        override=args.inference_size,
    )

    if args.input_image or args.output_image:
        if not args.input_image or not args.output_image:
            parser.error("单图模式需要同时提供 --input-image 与 --output-image")
        if args.input_dir or args.output_dir:
            parser.error("--input-image 与 --input-dir 互斥")
        if args.mode != "stub":
            env_code = check_env()
            if env_code != 0:
                print("深度模型未就绪，请执行: npm run setup:depth-model", file=sys.stderr)
                return env_code
        infer_single_image(
            args.input_image,
            args.output_image,
            style,
            args.device,
            model_id,
            args.quality,
            inference_size,
            invert_depth=args.invert_depth,
            post_process=post_process,
        )
        return 0

    if not args.input_dir or not args.output_dir:
        parser.error("需要 --input-dir 与 --output-dir，或 --input-image 与 --output-image")

    if args.mode != "stub":
        env_code = check_env()
        if env_code != 0:
            print("深度模型未就绪，请执行: npm run setup:depth-model", file=sys.stderr)
            return env_code

    infer_frames(
        args.input_dir,
        args.output_dir,
        style,
        args.device,
        args.mode,
        model_id,
        args.quality,
        inference_size,
        invert_depth=args.invert_depth,
        post_process=post_process,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
