package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	seedanceAssetPollWait = 1200 * time.Millisecond
	seedanceAssetMaxWait  = 90 * time.Second
)

func prepareSeedanceMedia(ctx context.Context, root, base, apiKey string, body map[string]any, workspace string, production bool, r *http.Request, payload map[string]json.RawMessage) error {
	content, ok := body["content"].([]map[string]any)
	if !ok || len(content) == 0 {
		return nil
	}
	storeCfg := resolveVideoStorageConfig(r, payload)
	scope := seedanceAssetScope{base: base, apiKey: apiKey, model: videoRequestedModel(payload), workspace: workspace}
	scope.preferSourceURL = seedanceUsesSourceURL(base, scope.model)
	imageIndex := 0
	for index, item := range content {
		switch item["type"] {
		case "image_url":
			node, _ := item["image_url"].(map[string]string)
			raw := strings.TrimSpace(node["url"])
			resolved, err := resolveSeedanceImageRef(ctx, scope, raw, imageIndex, workspace, production, storeCfg)
			if err != nil {
				return err
			}
			content[index]["image_url"] = map[string]string{"url": resolved}
			imageIndex++
		case "video_url":
			node, _ := item["video_url"].(map[string]string)
			raw := strings.TrimSpace(node["url"])
			resolved, err := resolveSeedanceVideoRef(ctx, scope, raw, workspace, production, storeCfg)
			if err != nil {
				return err
			}
			content[index]["video_url"] = map[string]string{"url": resolved}
		case "audio_url":
			node, _ := item["audio_url"].(map[string]string)
			resolved, err := resolveSeedanceAudioRef(ctx, root, scope, node["url"], workspace, production, storeCfg)
			if err != nil {
				return err
			}
			content[index]["audio_url"] = map[string]string{"url": resolved}
		}
	}
	body["content"] = content
	return nil
}

func resolveSeedanceImageRef(ctx context.Context, scope seedanceAssetScope, raw string, index int, workspace string, production bool, storeCfg *storage.ObjectConfig) (string, error) {
	ref := localEditStorageReference(normalizeImageRef(raw))
	if cached, err := reuseSeedanceCachedURI(ctx, scope, "Image", ref); cached != "" || err != nil {
		if err != nil {
			return "", err
		}
		return scope.mediaURI(cached, ref), nil
	}
	lower := strings.ToLower(ref)
	if strings.HasPrefix(lower, "asset://") {
		return ensureSeedanceAssetActive(ctx, scope, strings.TrimSpace(ref[len("asset://"):]), "Image")
	}
	if strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") {
		if assetURI, err := registerSeedanceAsset(ctx, scope, ref, "Image"); err != nil {
			return "", err
		} else if assetURI != "" {
			return scope.mediaURI(assetURI, ref), nil
		}
	}
	if storeCfg != nil && (strings.HasPrefix(lower, "data:image/") || strings.HasPrefix(ref, "/storage/")) {
		uploaded, err := uploadSeedanceLocalImage(ctx, ref, index, workspace, production, *storeCfg)
		if err == nil && uploaded != "" {
			if assetURI, assetErr := registerSeedanceAsset(ctx, scope, uploaded, "Image"); assetErr != nil {
				return "", assetErr
			} else if assetURI != "" {
				if strings.HasPrefix(ref, "/storage/") {
					storeSeedanceCachedURI(scope, "Image", ref, assetURI)
				}
				return scope.mediaURI(assetURI, uploaded), nil
			}
			return uploaded, nil
		}
	}
	converted, err := dashscopeImageRef(ctx, ref, index, workspace, production)
	if err != nil {
		return "", err
	}
	if converted == "" {
		return "", imageEditPrepareError{"参考图地址为空"}
	}
	return converted, nil
}

func resolveSeedanceVideoRef(ctx context.Context, scope seedanceAssetScope, raw, workspace string, production bool, storeCfg *storage.ObjectConfig) (string, error) {
	ref := localEditStorageReference(normalizeImageRef(raw))
	if cached, err := reuseSeedanceCachedURI(ctx, scope, "Video", ref); cached != "" || err != nil {
		if err != nil {
			return "", err
		}
		return scope.mediaURI(cached, ref), nil
	}
	origRef := ref
	lower := strings.ToLower(ref)
	if strings.HasPrefix(lower, "asset://") {
		return ensureSeedanceAssetActive(ctx, scope, strings.TrimSpace(ref[len("asset://"):]), "Video")
	}
	if strings.HasPrefix(ref, "/storage/") {
		if storeCfg == nil {
			return "", imageEditPrepareError{"当前未配置对象存储（OSS/R2/COS/S3）。Seedance 参考视频需要公网可访问链接，请在【设置 -> 对象存储】中完成配置后重试。"}
		}
		uploaded, err := uploadVideoReference(ctx, ref, workspace, production, *storeCfg)
		if err != nil {
			return "", err
		}
		ref = uploaded
	} else if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "http://") {
		return "", imageEditPrepareError{"参考视频需要公网可访问链接或 asset:// 素材标识"}
	}
	assetURI, err := registerSeedanceAsset(ctx, scope, ref, "Video")
	if err != nil {
		return "", err
	}
	if assetURI != "" {
		if strings.HasPrefix(origRef, "/storage/") {
			storeSeedanceCachedURI(scope, "Video", origRef, assetURI)
		}
		return scope.mediaURI(assetURI, ref), nil
	}
	return ref, nil
}

func registerSeedanceAsset(ctx context.Context, scope seedanceAssetScope, mediaURL, assetType string) (string, error) {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(scope.base), "/")
	if root == "" || scope.apiKey == "" {
		return "", nil
	}
	endpoint := root + "/seedance/v3/assets/create"
	status, raw, err := gateway.PostModel(ctx, http.MethodPost, endpoint, scope.apiKey, map[string]any{
		"url":       mediaURL,
		"assetType": assetType,
	}, 20*time.Second)
	if err != nil || status == http.StatusNotFound || status == http.StatusMethodNotAllowed || status == http.StatusNotImplemented || status >= 500 {
		return "", nil
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		if status < 200 || status >= 300 {
			return "", errors.New("Seedance 素材创建失败，请检查渠道凭证和素材地址")
		}
		return "", nil
	}
	assetID, assetState, reason := parseSeedanceAssetResponse(data)
	if status < 200 || status >= 300 || isSeedanceAssetFailure(data, assetState) {
		if reason == "" {
			reason = seedanceAssetRejectText(assetType, assetState)
		}
		return "", errors.New(gateway.PresentVideoError(reason))
	}
	if assetID == "" {
		return "", nil
	}
	if strings.EqualFold(assetState, "Active") {
		uri := "asset://" + assetID
		storeSeedanceCachedURI(scope, assetType, mediaURL, uri)
		return uri, nil
	}
	uri, err := ensureSeedanceAssetActive(ctx, scope, assetID, assetType)
	if errors.Is(err, errSeedanceAssetQueryUnsupported) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if uri != "" {
		storeSeedanceCachedURI(scope, assetType, mediaURL, uri)
	}
	return uri, nil
}

func ensureSeedanceAssetActive(ctx context.Context, scope seedanceAssetScope, assetID, assetType string) (string, error) {
	assetID = strings.TrimSpace(strings.TrimPrefix(assetID, "asset://"))
	if assetID == "" {
		return "", imageEditPrepareError{"Seedance 素材 ID 不能为空"}
	}
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(scope.base), "/")
	endpoint := root + "/seedance/v3/assets/query"
	deadline := time.Now().Add(seedanceAssetMaxWait)
	for {
		status, raw, err := gateway.PostModel(ctx, http.MethodPost, endpoint, scope.apiKey, map[string]any{
			"assetId": assetID,
		}, 15*time.Second)
		if err != nil {
			if ctx.Err() != nil {
				return "", errors.New("等待 Seedance 素材审核就绪已取消")
			}
		} else if status == http.StatusMethodNotAllowed || status == http.StatusNotImplemented {
			return "", errSeedanceAssetQueryUnsupported
		} else {
			var data map[string]any
			if json.Unmarshal(raw, &data) == nil {
				_, state, reason := parseSeedanceAssetResponse(data)
				missing := seedanceAssetUnavailable(state, reason) && !seedanceAssetAccessFailure(data)
				failed := isSeedanceAssetFailure(data, state)
				if status >= 200 && status < 500 && status != http.StatusUnauthorized && status != http.StatusForbidden &&
					(missing || ((status == http.StatusNotFound || status == http.StatusGone) && !failed)) {
					return "", errSeedanceAssetUnavailable
				}
				if failed || (status >= 400 && status < 500) {
					if reason == "" {
						reason = seedanceAssetRejectText(assetType, state)
					}
					return "", errors.New(gateway.PresentVideoError(reason))
				}
				if status >= 200 && status < 300 && strings.EqualFold(state, "Active") {
					return "asset://" + assetID, nil
				}
			}
			if status == http.StatusNotFound || status == http.StatusGone {
				return "", errSeedanceAssetUnavailable
			}
			if status >= 400 && status < 500 {
				return "", errors.New("Seedance 素材查询失败，请检查渠道凭证和素材地址")
			}
		}
		if !time.Now().Before(deadline) {
			return "", errors.New("Seedance 素材状态仍为处理中（未达到 Active），请稍后重试")
		}
		select {
		case <-ctx.Done():
			return "", errors.New("等待 Seedance 素材审核就绪已取消")
		case <-time.After(seedanceAssetPollWait):
		}
	}
}

func parseSeedanceAssetResponse(data map[string]any) (assetID, status, reason string) {
	nested, _ := data["data"].(map[string]any)
	assetID = firstString(nested, "assetId", "asset_id", "id")
	if assetID == "" {
		assetID = firstString(data, "assetId", "asset_id", "id")
	}
	status = firstString(nested, "status", "state")
	if status == "" {
		status = firstString(data, "status", "state")
	}
	reason = firstString(nested, "failReason", "fail_reason", "message", "error", "reason")
	if reason == "" {
		reason = seedanceErrorMessages(data["errorMessages"])
	}
	if reason == "" {
		msg := firstString(data, "msg", "message", "fail_reason", "error")
		if !strings.EqualFold(msg, "success") && !strings.EqualFold(msg, "ok") {
			reason = msg
		}
	}
	if reason == "" {
		reason = videoErrorMessage(data)
	}
	return assetID, status, reason
}

func seedanceErrorMessages(raw any) string {
	switch typed := raw.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				parts = append(parts, strings.TrimSpace(text))
			}
		}
		return strings.Join(parts, "；")
	default:
		return ""
	}
}

func isSeedanceAssetFailure(data map[string]any, state string) bool {
	if code, ok := data["code"].(float64); ok && code != 0 {
		return true
	}
	if code, ok := data["code"].(string); ok && code != "" && code != "0" {
		return true
	}
	if data["error"] != nil && data["error"] != "" {
		return true
	}
	switch strings.ToUpper(strings.TrimSpace(state)) {
	case "FAILED", "FAILURE", "ERROR", "REJECTED", "INVALID", "BLOCKED", "SENSITIVE", "INACTIVE", "DELETED", "EXPIRED":
		return true
	default:
		return false
	}
}

func seedanceAssetRejectText(assetType, state string) string {
	label := "参考图片"
	if strings.EqualFold(assetType, "Video") {
		label = "参考视频"
	} else if strings.EqualFold(assetType, "Audio") {
		label = "参考音频"
	}
	if state != "" {
		return "Seedance " + label + "素材检测未通过（状态：" + state + "），请更换无敏感内容或清晰合规的素材后重试"
	}
	return "Seedance " + label + "素材检测未通过，请更换无敏感内容或清晰合规的素材后重试"
}

var seedanceAssetCache sync.Map

var errSeedanceAssetUnavailable = errors.New("Seedance 素材不存在或已失效，请重新选择原始素材")
var errSeedanceAssetQueryUnsupported = errors.New("当前渠道不支持查询 Seedance 素材状态，请改用原始素材地址")

type seedanceAssetScope struct {
	base, apiKey, model, workspace string
	preferSourceURL                bool
}

func seedanceUsesSourceURL(base, model string) bool {
	parsed, err := url.Parse(gateway.NormalizeGatewayBaseURL(base))
	return err == nil && seedance25(model) && (parsed.Hostname() == "ai.comfly.org" || parsed.Hostname() == "comfly.org")
}

func (scope seedanceAssetScope) mediaURI(assetURI, source string) string {
	if scope.preferSourceURL && (strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://")) {
		// Comfly's asset API has no model selector. Keep its compliance check, but
		// let 2.5 ingest the source in the account selected for that generation.
		return source
	}
	return assetURI
}

func seedanceCacheKey(scope seedanceAssetScope, assetType, ref string) [32]byte {
	// Neither credentials nor signed source URLs belong in cache keys as plaintext.
	encoded, _ := json.Marshal([]string{
		strings.TrimRight(gateway.NormalizeGatewayBaseURL(scope.base), "/"),
		scope.apiKey, scope.model, scope.workspace, assetType, strings.TrimSpace(ref),
	})
	return sha256.Sum256(encoded)
}

func loadSeedanceCachedURI(scope seedanceAssetScope, assetType, ref string) string {
	if cached, ok := seedanceAssetCache.Load(seedanceCacheKey(scope, assetType, ref)); ok {
		text, _ := cached.(string)
		return text
	}
	return ""
}

func storeSeedanceCachedURI(scope seedanceAssetScope, assetType, ref, uri string) {
	if strings.TrimSpace(ref) != "" && strings.TrimSpace(uri) != "" {
		seedanceAssetCache.Store(seedanceCacheKey(scope, assetType, ref), uri)
	}
}

func reuseSeedanceCachedURI(ctx context.Context, scope seedanceAssetScope, assetType, ref string) (string, error) {
	if scope.preferSourceURL && strings.HasPrefix(ref, "/storage/") {
		// A source URL for a private local file must be freshly signed/uploaded;
		// the cached asset ID alone cannot be used as its transport address.
		return "", nil
	}
	cached := loadSeedanceCachedURI(scope, assetType, ref)
	if cached == "" {
		return "", nil
	}
	uri, err := ensureSeedanceAssetActive(ctx, scope, cached, assetType)
	if errors.Is(err, errSeedanceAssetUnavailable) || errors.Is(err, errSeedanceAssetQueryUnsupported) {
		// The caller still has the original source and can register it again before
		// the one paid generation request. Never retry a generation automatically.
		seedanceAssetCache.CompareAndDelete(seedanceCacheKey(scope, assetType, ref), cached)
		return "", nil
	}
	return uri, err
}

func seedanceAssetUnavailable(state, reason string) bool {
	lower := strings.ToLower(reason)
	for _, marker := range []string{"unauthorized", "forbidden", "access denied", "permission", "api key", "token", "credential", "sensitive", "鉴权", "权限", "密钥", "敏感"} {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	switch strings.ToUpper(strings.TrimSpace(state)) {
	case "DELETED", "EXPIRED", "NOT_FOUND":
		return true
	}
	return strings.Contains(lower, "asset") && (strings.Contains(lower, "not found") || strings.Contains(lower, "does not exist") || strings.Contains(lower, "expired")) ||
		strings.Contains(reason, "素材不存在") || strings.Contains(reason, "素材已过期") || strings.Contains(reason, "指定的资源未找到")
}

func seedanceAssetAccessFailure(data map[string]any) bool {
	code, _ := data["code"].(string)
	if numeric, ok := data["code"].(float64); ok && (numeric == 401 || numeric == 403 || numeric == 1501) {
		return true
	}
	switch strings.ToLower(code) {
	case "401", "403", "1501", "unauthorized", "forbidden", "permissiondenied", "accessdenied":
		return true
	}
	if nested, ok := data["error"].(map[string]any); ok {
		return seedanceAssetAccessFailure(nested)
	}
	return false
}

func resolveVideoStorageConfig(r *http.Request, payload map[string]json.RawMessage) *storage.ObjectConfig {
	if r != nil {
		if cfg := storage.ResolveObjectConfig(storageConfigHeader(r)); cfg != nil {
			return cfg
		}
	}
	if raw, ok := payload["storageConfig"]; ok {
		var custom map[string]any
		if json.Unmarshal(raw, &custom) == nil {
			if cfg := storage.ResolveObjectConfig(custom); cfg != nil {
				return cfg
			}
		}
	}
	return storage.ResolveObjectConfig(nil)
}

func uploadSeedanceLocalImage(ctx context.Context, ref string, index int, workspace string, production bool, cfg storage.ObjectConfig) (string, error) {
	file, err := loadEditImage(ctx, ref, index, workspace, production)
	if err != nil {
		return "", err
	}
	key := storage.ObjectKeyWithConfig(cfg, "refs", extension(file.mime, file.filename), "")
	if err := storage.Objects.Put(ctx, cfg, key, file.mime, file.data); err != nil {
		return "", err
	}
	return storage.ReferenceObjectURL(ctx, cfg, key)
}

func resolveSeedanceLocalVideoPath(ref, workspace string, production bool) (string, error) {
	rel := strings.TrimPrefix(ref, "/storage/")
	rel = strings.SplitN(rel, "?", 2)[0]
	rel = strings.SplitN(rel, "#", 2)[0]
	decoded := rel
	for range 2 {
		next, err := url.PathUnescape(decoded)
		if err != nil {
			return "", imageEditPrepareError{"无权读取该参考视频"}
		}
		decoded = next
	}
	if workspace == "" || !storage.WorkspaceRel(decoded, workspace, !production) {
		return "", imageEditPrepareError{"无权读取该参考视频"}
	}
	path := storage.StoredFile(decoded)
	if path == "" {
		return "", imageEditPrepareError{"本地参考视频不存在"}
	}
	return path, nil
}

func uploadVideoReference(ctx context.Context, ref, workspace string, production bool, cfg storage.ObjectConfig) (string, error) {
	path, err := resolveSeedanceLocalVideoPath(ref, workspace, production)
	if err != nil {
		return "", err
	}
	handle, err := os.Open(path)
	if err != nil {
		return "", imageEditPrepareError{"本地参考视频不存在"}
	}
	defer handle.Close()
	body, err := io.ReadAll(io.LimitReader(handle, 32<<20+1))
	if err != nil || len(body) == 0 || len(body) > 32<<20 {
		return "", imageEditPrepareError{"参考视频为空或超过 32MB"}
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if ext == "" {
		ext = "mp4"
	}
	mimeType := "video/mp4"
	switch ext {
	case "mov":
		mimeType = "video/quicktime"
	case "webm":
		mimeType = "video/webm"
	}
	key := storage.ObjectKeyWithConfig(cfg, "refs", ext, "")
	if err := storage.Objects.Put(ctx, cfg, key, mimeType, body); err != nil {
		return "", imageEditPrepareError{"对象存储上传参考视频失败，请检查存储配置"}
	}
	signed, err := storage.ReferenceObjectURL(ctx, cfg, key)
	if err != nil {
		return "", imageEditPrepareError{"参考视频已上传，但无法生成访问链接，请检查存储配置"}
	}
	return signed, nil
}
