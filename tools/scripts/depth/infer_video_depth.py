#!/usr/bin/env python3
"""CLI and frame/image orchestration for monocular depth inference."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from depth_runtime import (
    PostProcessConfig, check_env, cv2, emit_meta, emit_progress, infer_depth,
    load_depth_runtime, median_filter, np, Image, resolve_device,
    resolve_inference_size, resolve_quality_profile,
)
from depth_processing import apply_style


def _temporal_median(window_maps: list["np.ndarray"]) -> "np.ndarray":
    assert np is not None
    count = len(window_maps)
    if count == 1:
        return window_maps[0].astype(np.float32, copy=False)
    if count == 2:
        return ((window_maps[0] + window_maps[1]) * np.float32(0.5)).astype(np.float32, copy=False)
    if count == 3:
        a, b, c = window_maps[0], window_maps[1], window_maps[2]
        return np.maximum(np.minimum(a, b), np.minimum(np.maximum(a, b), c)).astype(np.float32, copy=False)
    return np.median(np.stack(window_maps, axis=0), axis=0).astype(np.float32)


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

    # Keep only the temporal window in memory.
    # For non-CUDA devices (MPS/CPU) with >=24 frames in fast/standard quality,
    # infer key frames with stride=2 and linearly interpolate odd frames before
    # temporal median smoothing, cutting neural inference time in half while
    # preserving motion-capture continuity.
    total = len(frame_files)
    stride = 2 if (quality in ("fast", "standard") and resolved_device != "cuda" and total >= 24) else 1
    half_window = max(0, cfg.temporal_window // 2)
    recent_depths: dict[int, np.ndarray] = {}
    prev_key_index = -1
    prev_key_depth: np.ndarray | None = None
    next_output_index = 0

    for frame_index, frame_path in enumerate(frame_files):
        is_last_frame = frame_index == total - 1
        if stride == 1 or frame_index % stride == 0 or is_last_frame:
            frame = cv2.imread(str(frame_path))
            if frame is None:
                raise RuntimeError(f"无法读取帧: {frame_path}")
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            cur_depth = infer_depth(Image.fromarray(rgb), runtime)
            if prev_key_depth is not None and frame_index - prev_key_index > 1:
                span = float(frame_index - prev_key_index)
                for mid_index in range(prev_key_index + 1, frame_index):
                    alpha = np.float32((mid_index - prev_key_index) / span)
                    recent_depths[mid_index] = (
                        prev_key_depth * (np.float32(1.0) - alpha) + cur_depth * alpha
                    ).astype(np.float32, copy=False)
            recent_depths[frame_index] = cur_depth
            prev_key_index = frame_index
            prev_key_depth = cur_depth

        while next_output_index < total:
            required_right = min(total - 1, next_output_index + half_window)
            if required_right not in recent_depths:
                break

            window_start = max(0, next_output_index - half_window)
            window_end = min(total, next_output_index + half_window + 1)
            window_maps = [recent_depths[i] for i in range(window_start, window_end)]
            stable_depth = _temporal_median(window_maps)

            output_frame = frame_files[next_output_index]
            vis = apply_style(stable_depth, style, invert_depth=invert_depth, post_process=cfg)
            cv2.imwrite(str(output_dir / output_frame.name), vis)
            emit_progress(next_output_index + 1, total)
            next_output_index += 1

            earliest_needed = min(max(0, next_output_index - half_window), prev_key_index)
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
    resolved_device = "cpu" if args.mode == "stub" else resolve_device(args.device)
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
                print("深度模型未就绪，请执行: pnpm setup:depth-model", file=sys.stderr)
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
            print("深度模型未就绪，请执行: pnpm setup:depth-model", file=sys.stderr)
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
