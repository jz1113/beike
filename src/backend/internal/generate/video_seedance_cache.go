package generate

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/gateway"
)

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
