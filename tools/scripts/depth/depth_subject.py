"""Semantic person masks from source RGB; depth alone cannot separate the floor."""

from __future__ import annotations

from depth_runtime import Image, cv2, np, _load_pretrained_offline_first


def refine_person_mask(mask, image):
    """Align a coarse semantic boundary to native-resolution luminance edges."""
    guide = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    matte = mask.astype(np.float32)
    window = (11, 11)
    mean = cv2.blur(guide, window)
    mean_mask = cv2.blur(matte, window)
    cov = cv2.blur(guide * matte, window) - mean * mean_mask
    var = cv2.blur(guide * guide, window) - mean * mean
    slope = cov / (np.maximum(var, 0) + 0.002)
    guided = cv2.blur(slope, window) * guide + cv2.blur(mean_mask - slope * mean, window)
    return np.clip((guided - 0.40) * 5.0, 0, 1)


class PersonSegmenter:
    def __init__(self, device: str) -> None:
        import torch
        from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation

        model_id = "nvidia/segformer-b0-finetuned-ade-512-512"
        self.device = device
        self.previous_gray = None
        self.previous_mask = None
        self.recovered_frames = 0
        self.processor = _load_pretrained_offline_first(AutoImageProcessor, model_id, use_fast=False)
        self.model = _load_pretrained_offline_first(AutoModelForSemanticSegmentation, model_id)
        self.model.to(torch.device(device)).eval()
        self.person_ids = [int(i) for i, label in self.model.config.id2label.items() if label.lower() == "person"]
        if not self.person_ids:
            raise RuntimeError("人物分割模型未提供 person 类别")

    def mask(self, image: "Image.Image") -> "np.ndarray":
        import torch
        import torch.nn.functional as functional

        inputs = self.processor(images=image, return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            logits = self.model(**inputs).logits
            scale = min(1.0, 768.0 / max(image.height, image.width))
            size = (max(1, round(image.height * scale)), max(1, round(image.width * scale)))
            labels = functional.interpolate(
                logits, size=size, mode="bilinear", align_corners=False,
            ).argmax(dim=1)[0].cpu().numpy()
        mask = np.isin(labels, self.person_ids).astype(np.uint8)
        mask = cv2.resize(mask, (image.width, image.height), interpolation=cv2.INTER_NEAREST)
        matte = refine_person_mask(mask, image)
        gray = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
        # Recover brief segmentation dropouts on continuous footage. Warp the
        # previous good silhouette into this frame instead of holding its pose.
        previous = self.previous_mask
        if (previous is not None and previous.shape == matte.shape and self.recovered_frames < 5
                and 0 < matte.sum() < 0.65 * previous.sum()
                and cv2.absdiff(gray, self.previous_gray).mean() < 12):
            size = (max(1, gray.shape[1] // 2), max(1, gray.shape[0] // 2))
            flow = cv2.calcOpticalFlowFarneback(cv2.resize(gray, size), cv2.resize(self.previous_gray, size),
                                                None, 0.5, 3, 21, 3, 5, 1.2, 0)
            flow = cv2.resize(flow, (gray.shape[1], gray.shape[0])) * 2
            y, x = np.indices(gray.shape, dtype=np.float32)
            carried = cv2.remap(previous, x + flow[:, :, 0], y + flow[:, :, 1], cv2.INTER_LINEAR)
            matte = np.maximum(matte, carried)
            self.recovered_frames += 1
        else:
            self.recovered_frames = 0
        self.previous_gray, self.previous_mask = gray, matte
        return matte
