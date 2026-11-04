package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

type seedancePrecheckRequestItem struct {
	URL       string `json:"url"`
	MediaType string `json:"mediaType"`
}

type seedancePrecheckResultItem struct {
	URL         string  `json:"url"`
	MediaType   string  `json:"mediaType"`
	Status      string  `json:"status"`
	AssetURI    string  `json:"assetUri,omitempty"`
	Error       string  `json:"error,omitempty"`
	DurationSec float64 `json:"durationSec,omitempty"`
	Width       int     `json:"width,omitempty"`
	Height      int     `json:"height,omitempty"`
}

const (
	seedanceMinVideoSec = 2.0
	seedanceMaxVideoSec = 30.0
)

func SeedancePrecheck(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{"success": false, "error": "仅支持 POST"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || !json.Valid(raw) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求参数格式无效"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(raw, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求参数格式无效"})
			return
		}
		var items []seedancePrecheckRequestItem
		if rawItems, ok := payload["items"]; ok {
			_ = json.Unmarshal(rawItems, &items)
		}
		if len(items) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少待检测素材 items"})
			return
		}
		if len(items) > 16 {
			items = items[:16]
		}
		base, apiKey := videoCredentials(cfg, r, payload)
		scope := seedanceAssetScope{base: base, apiKey: apiKey, model: videoRequestedModel(payload), workspace: workspaceOf(r)}
		storeCfg := resolveVideoStorageConfig(r, payload)
		workspace := workspaceOf(r)
		production := cfg.Production()

		results := make([]seedancePrecheckResultItem, 0, len(items))
		for index, item := range items {
			ctx, cancel := context.WithTimeout(r.Context(), 95*time.Second)
			res := precheckSingleSeedanceAsset(ctx, cfg, scope, workspace, production, storeCfg, item, index)
			cancel()
			results = append(results, res)
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"results": results,
		})
	}
}

func precheckSingleSeedanceAsset(
	ctx context.Context,
	cfg config.Config,
	scope seedanceAssetScope,
	workspace string,
	production bool,
	storeCfg *storage.ObjectConfig,
	item seedancePrecheckRequestItem,
	index int,
) seedancePrecheckResultItem {
	ref := strings.TrimSpace(item.URL)
	kind := normalizeSeedancePrecheckKind(item.MediaType, ref)
	out := seedancePrecheckResultItem{
		URL:       ref,
		MediaType: kind,
	}
	if ref == "" {
		out.Status = "rejected"
		out.Error = "素材地址为空"
		return out
	}
	if kind == "video" && strings.HasPrefix(ref, "/storage/") {
		path, err := resolveSeedanceLocalVideoPath(ref, workspace, production)
		if err != nil {
			out.Status = "rejected"
			out.Error = err.Error()
			return out
		}
		if probe, probeErr := system.ProbeVideo(cfg.Root, path); probeErr == nil {
			out.DurationSec = probe.Duration
			out.Width = probe.Width
			out.Height = probe.Height
			if msg := validateSeedanceVideoDuration(probe.Duration); msg != "" {
				out.Status = "rejected"
				out.Error = msg
				return out
			}
		}
	}
	if strings.TrimSpace(scope.base) == "" || strings.TrimSpace(scope.apiKey) == "" {
		out.Status = "skipped"
		return out
	}
	var resolved string
	var err error
	if kind == "video" {
		resolved, err = resolveSeedanceVideoRef(ctx, scope, ref, workspace, production, storeCfg)
	} else {
		resolved, err = resolveSeedanceImageRef(ctx, scope, ref, index, workspace, production, storeCfg)
	}
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "未配置对象存储") {
			out.Status = "skipped"
			out.Error = msg
			return out
		}
		out.Status = "rejected"
		out.Error = msg
		return out
	}
	if strings.HasPrefix(strings.ToLower(resolved), "asset://") {
		out.Status = "passed"
		out.AssetURI = resolved
		return out
	}
	out.Status = "skipped"
	return out
}

func normalizeSeedancePrecheckKind(mediaType, ref string) string {
	lower := strings.ToLower(strings.TrimSpace(mediaType))
	if lower == "video" || lower == "depth-video" {
		return "video"
	}
	if lower == "image" || lower == "depth-image" {
		return "image"
	}
	clean := strings.ToLower(strings.SplitN(strings.SplitN(ref, "?", 2)[0], "#", 2)[0])
	if strings.HasSuffix(clean, ".mp4") || strings.HasSuffix(clean, ".mov") || strings.HasSuffix(clean, ".webm") || strings.HasSuffix(clean, ".m4v") {
		return "video"
	}
	return "image"
}

func validateSeedanceVideoDuration(duration float64) string {
	if duration <= 0 {
		return ""
	}
	if duration < seedanceMinVideoSec-0.05 || duration > seedanceMaxVideoSec+0.4 {
		return fmt.Sprintf("待校验视频要求时长 2 ~ 30 秒（当前 %.1f 秒）", duration)
	}
	return ""
}
