package system

import (
	"context"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
)

func Pricing() http.Handler { return pricingHandler() }
func DepthEnv(cfg config.Config) http.Handler {
	return depthEnvHandler(cfg)
}
func ConfigGet(cfg config.Config) http.Handler  { return systemConfigHandler(cfg) }
func ConfigPost(cfg config.Config) http.Handler { return systemConfigPostHandler(cfg) }
func GatewayUser() http.Handler                 { return gatewayUserHandler() }
func ModelFetch(cfg config.Config) http.Handler { return modelFetchHandler(cfg) }
func MemoryCleanup(cfg config.Config) http.Handler {
	return memoryCleanupHandler(cfg)
}
func MediaReview(cfg config.Config) http.Handler { return mediaReviewHandler(cfg) }

type CatalogModel = catalogModel

func NormalizeGatewayBaseURL(raw string) string { return normalizeGatewayBaseURL(raw) }
func AllowCustomBase(cfg config.Config) bool    { return allowCustomBase(cfg) }
func SafeHTTPSGateway(raw string) bool          { return safeHTTPSGateway(raw) }
func PublicHTTPGateway(raw string) bool         { return publicHTTPGateway(raw) }
func ApprovedModel(root, id string) (CatalogModel, bool) {
	return approvedModel(root, id)
}
func GatewayGET(ctx context.Context, client *http.Client, rawURL, token, userID string) (map[string]any, int, error) {
	return gatewayGET(ctx, client, rawURL, token, userID)
}
