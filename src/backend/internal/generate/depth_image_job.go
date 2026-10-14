package generate

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func runDepthImage(cfg config.Config, w http.ResponseWriter, r *http.Request, file *depthImageFile, fields map[string]string) {
	style := resolveDepthStyle(fields["style"], fields["colormap"])
	quality := resolveDepthQuality(fields["quality"])
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation = strings.TrimSpace(fields["clientTaskId"])
	}
	fingerprint := depthFingerprint("depth-image", depthInputDigest(file.data), style, quality)
	status, body := guardDepth(cfg, r, "depth-image", operation, fingerprint, func() (int, map[string]any) {
		return executeDepthImage(cfg, httpx.WorkspaceFrom(r), file.data, style, quality)
	})
	httpx.WriteJSON(w, status, body)
}

func executeDepthImage(cfg config.Config, workspace string, data []byte, style, quality string) (int, map[string]any) {
	work, err := os.MkdirTemp("", "depth-image-")
	if err != nil {
		return depthFail("深度图片生成失败")
	}
	defer os.RemoveAll(work)
	input := filepath.Join(work, "input.jpg")
	output := filepath.Join(work, "output.png")
	if err := os.WriteFile(input, data, 0o600); err != nil {
		return depthFail("深度图片生成失败")
	}
	meta, err := runDepthPython(cfg.Root, "image", style, quality, map[string]string{"input": input, "output": output}, nil, nil)
	if err != nil {
		return depthFail(err.Error())
	}
	encoded, err := os.ReadFile(output)
	if err != nil {
		return depthFail("深度图片生成失败：无输出文件")
	}
	resultURL, err := persistDepthBytes(cfg, workspace, "image/png", encoded, "")
	if err != nil {
		return depthFail("深度图片生成失败")
	}
	body := map[string]any{"success": true, "resultUrl": resultURL, "style": style, "quality": quality}
	if meta.ModelID != "" {
		body["modelId"] = meta.ModelID
		body["inferenceSizePx"] = meta.InferenceSizePx
		body["device"] = meta.Device
	}
	return http.StatusOK, body
}

func depthFail(message string) (int, map[string]any) {
	return http.StatusInternalServerError, map[string]any{"success": false, "submissionRejected": true, "error": message}
}
