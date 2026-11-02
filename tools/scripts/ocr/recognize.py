"""Read original image bytes on stdin; emit local RapidOCR results as JSON."""
import contextlib
import io
import json
import sys
import warnings

REVISION = "rapidocr-1.4.4-tiles-v1"


def create_engine():
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)


def recognize(data):
    import numpy as np
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    with Image.open(io.BytesIO(data)) as source:
        if source.width * source.height > 40_000_000:
            raise ValueError("图片超过 4000 万像素，请裁剪后上传")
        image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size
    engine = create_engine()
    lines = []
    # Ownership by box centre removes overlap duplicates without merging distinct lines.
    core, overlap = 1400, 120
    for y in range(0, height, core):
        for x in range(0, width, core):
            left, top = max(0, x - overlap), max(0, y - overlap)
            right, bottom = min(width, x + core + overlap), min(height, y + core + overlap)
            tile = np.asarray(image.crop((left, top, right, bottom)))[:, :, ::-1].copy()
            result, _ = engine(tile)
            for box, text, confidence in result or []:
                box = [[round(float(p[0]) + left, 1), round(float(p[1]) + top, 1)] for p in box]
                cx, cy = sum(p[0] for p in box) / 4, sum(p[1] for p in box) / 4
                if not (x <= cx < min(width, x + core) and y <= cy < min(height, y + core)):
                    continue
                lines.append({"box": box, "text": str(text), "confidence": round(float(confidence), 4)})
                if len(lines) > 5000:
                    raise ValueError("图片文字过多，请拆分图片后识别")
    lines.sort(key=lambda line: (min(p[1] for p in line["box"]), min(p[0] for p in line["box"])))
    text = "\n".join(line["text"] for line in lines)
    if len(text) > 100_000:
        raise ValueError("图片文字过多，请拆分图片后识别")
    return {"engine": REVISION, "width": width, "height": height, "lines": lines, "text": text}


if __name__ == "__main__":
    try:
        # Third-party diagnostics must never corrupt the JSON protocol on stdout.
        with contextlib.redirect_stdout(sys.stderr):
            if "--check-env" in sys.argv:
                create_engine()
                payload = {"ready": True, "engine": REVISION}
            else:
                raw = sys.stdin.buffer.read((12 << 20) + 1)
                if not raw or len(raw) > 12 << 20:
                    raise ValueError("原图为空或超过 12 MB")
                payload = recognize(raw)
        print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
