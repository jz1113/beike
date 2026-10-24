#!/usr/bin/env python3
"""Depth model profiles, loading, inference and environment checks."""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import json
from dataclasses import dataclass
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
