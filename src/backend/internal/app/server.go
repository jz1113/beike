// Package app is the HTTP front door. Registered routes are served here.
package app

import (
	"log"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/assets"
	"beike.local/cloud/src/backend/internal/assistant"
	"beike.local/cloud/src/backend/internal/catalog"
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/keywordreview"
	"beike.local/cloud/src/backend/internal/library"
	"beike.local/cloud/src/backend/internal/system"
	"beike.local/cloud/src/backend/internal/workshop"
)

type route struct {
	pattern   string
	protected bool
	handler   http.Handler
}

func nativeRoutes(cfg config.Config) []route {
	return []route{
		{"GET /api/health", false, health(cfg)},
		{"GET /api/assistant/sessions", true, assistant.Sessions(cfg)},
		{"PUT /api/assistant/sessions", true, assistant.SaveSessions(cfg)},
		{"DELETE /api/assistant/sessions", true, assistant.DeleteSession(cfg)},
		{"POST /api/assistant/extract-document", true, assistant.ExtractDocument(cfg)},
		{"POST /api/assistant/media", true, assistant.Media(cfg)},
		{"POST /api/assistant/chat", true, assistant.Chat(cfg)},
		{"POST /api/assistant/turn/start", true, assistant.StartTurn(cfg)},
		{"POST /api/assistant/turn/approve", true, assistant.ApproveTurn(cfg)},
		{"POST /api/assistant/turn/interrupt", true, assistant.InterruptTurn(cfg)},
		{"GET /api/assistant/threads/{threadId}/memory", true, assistant.Memory(cfg)},
		{"PUT /api/assistant/threads/{threadId}/memory", true, assistant.Memory(cfg)},
		{"GET /api/assistant/threads/{threadId}/turns", true, assistant.ThreadTurns(cfg)},
		{"GET /api/assistant/runs", true, assistant.AllRuns(cfg)},
		{"GET /api/assistant/threads/{threadId}/runs", true, assistant.ThreadRuns(cfg)},
		{"GET /api/assistant/turns/{turnId}/snapshot", true, assistant.TurnSnapshot(cfg)},
		{"POST /api/assistant/turns/{turnId}/recover", true, assistant.TurnRecover(cfg)},
		{"GET /api/system/models/pricing", true, system.Pricing()},
		{"GET /api/system/depth-env", true, system.DepthEnv(cfg)},
		{"GET /api/system/local-storage/stats", true, assets.StorageStats(cfg)},
		{"POST /api/system/local-storage/clear-derived", true, assets.ClearDerived(cfg)},
		{"GET /api/system/config", true, system.ConfigGet(cfg)},
		{"POST /api/system/config", true, system.ConfigPost(cfg)},
		{"POST /api/system/gateway-user", true, system.GatewayUser()},
		{"POST /api/system/models/fetch", true, system.ModelFetch(cfg)},
		{"POST /api/system/memory-cleanup", true, system.MemoryCleanup(cfg)},
		{"GET /api/system/media-review", true, system.MediaReview(cfg)},
		{"GET /api/system/proxy-image", false, system.ProxyImage(cfg)},
		{"GET /api/system/proxy-video", false, system.ProxyVideo(cfg)},
		{"POST /api/system/video-downloads/pick-directory", false, system.PickVideoDirectory(cfg)},
		{"POST /api/system/video-downloads", false, system.StartVideoDownload(cfg)},
		{"GET /api/system/video-downloads/{jobId}", false, system.VideoDownloadStatus(cfg)},
		{"POST /api/system/video-downloads/{jobId}/cancel", false, system.CancelVideoDownload(cfg)},
		{"POST /api/generate/keyword-review/balance", true, keywordreview.Balance()},
		{"POST /api/generate/keyword-review", true, keywordreview.Review(cfg)},
		{"GET /api/generate/keyword-review/rules", true, keywordreview.RulesGet(cfg)},
		{"PUT /api/generate/keyword-review/rules", true, keywordreview.RulesPut(cfg)},
		{"GET /api/catalog/categories", true, catalog.Categories(cfg)},
		{"POST /api/catalog/categories/migration-preview", true, catalog.CategoryPreview(cfg)},
		{"POST /api/catalog/categories/migration-apply", true, catalog.CategoryApply(cfg)},
		{"GET /api/catalog/prompts", true, catalog.Prompts(cfg)},
		{"POST /api/catalog/prompts", true, catalog.CreatePrompts(cfg)},
		{"DELETE /api/catalog/prompts", true, catalog.DeletePrompts(cfg)},
		{"GET /api/catalog/styles", true, catalog.Styles(cfg)},
		{"POST /api/catalog/styles", true, catalog.CreateStyle(cfg)},
		{"PUT /api/catalog/styles", true, catalog.UpdateStyle(cfg)},
		{"DELETE /api/catalog/styles", true, catalog.DeleteStyle(cfg)},
		{"POST /api/catalog/styles/extract", true, catalog.ExtractStyle(cfg)},
		{"POST /api/catalog/styles/parse-link", true, catalog.ParseLink(cfg)},
		{"GET /api/catalog/products", true, catalog.Products(cfg)},
		{"POST /api/catalog/products", true, catalog.CreateProduct(cfg)},
		{"PUT /api/catalog/products", true, catalog.UpdateProduct(cfg)},
		{"DELETE /api/catalog/products", true, catalog.DeleteProduct(cfg)},
		{"POST /api/catalog/collect", true, catalog.Collect(cfg)},
		{"POST /api/catalog/assets/seed", true, catalog.DisabledSeed()},
		{"POST /api/assets/storage/upload", true, assets.Upload(cfg)},
		{"POST /api/assets/storage/test", true, assets.TestStorage(cfg)},
		{"POST /api/assets/storage/migrate", true, assets.Migrate(cfg)},
		{"GET /api/assets/tasks", true, assets.Tasks(cfg)},
		{"DELETE /api/assets/tasks", true, assets.DeleteTasks(cfg)},
		{"GET /api/catalog/assets/source-check", true, library.SourceCheck(cfg)},
		{"POST /api/catalog/assets/source-check", true, library.SourceCheckPost(cfg)},
		{"GET /api/catalog/assets/reviews", true, library.Reviews(cfg)},
		{"POST /api/catalog/assets/reviews", true, library.ReviewsPost(cfg)},
		{"GET /api/catalog/assets/library", true, library.Get(cfg)},
		{"POST /api/catalog/assets/library", true, library.Post(cfg)},
		{"PUT /api/catalog/assets/library", true, library.Put(cfg)},
		{"DELETE /api/catalog/assets/library", true, library.Delete(cfg)},
		{"GET /api/catalog/assets/mother-replacement", true, library.MotherReplacement(cfg)},
		{"GET /api/catalog/assets/deconstruct/jobs", true, library.DeconstructJobs(cfg)},
		{"POST /api/catalog/assets/deconstruct/jobs", true, library.DeconstructJobsPost(cfg)},
		{"GET /api/catalog/assets/deconstruct/progress", true, library.DeconstructProgress(cfg)},
		{"POST /api/catalog/assets/deconstruct", true, library.Deconstruct(cfg)},
		{"GET /api/catalog/assets/{type}/{id}/performance", true, assets.Performance(cfg)},
		{"POST /api/catalog/assets/{type}/{id}/submit-review", true, assets.Lifecycle(cfg, "submit-review")},
		{"POST /api/catalog/assets/{type}/{id}/publish", true, assets.Lifecycle(cfg, "publish")},
		{"POST /api/catalog/assets/{type}/{id}/disable", true, assets.Lifecycle(cfg, "disable")},
		{"POST /api/catalog/assets/{type}/{id}/create-version", true, assets.Lifecycle(cfg, "create-version")},
		{"GET /api/catalog/workshop-batches", true, workshop.Batches(cfg)},
		{"POST /api/catalog/workshop-batches", true, workshop.CreateBatch(cfg)},
		{"POST /api/catalog/workshop-batches/active/archive", true, workshop.ArchiveBatch(cfg)},
		{"POST /api/catalog/workshop-batches/{id}/duplicate", true, workshop.DuplicateBatch(cfg)},
		{"POST /api/catalog/workshop-batches/{id}/events", true, workshop.BatchEvent(cfg)},
		{"GET /api/catalog/workshop-batches/active", true, workshop.ActiveBatch(cfg)},
		{"GET /api/catalog/workshop-batches/{id}", true, workshop.Batch(cfg)},
		{"PUT /api/catalog/workshop-batches/{id}", true, workshop.SaveBatch(cfg)},
		{"PATCH /api/catalog/workshop-batches/{id}", true, workshop.RenameBatch(cfg)},
		{"DELETE /api/catalog/workshop-batches/history", true, workshop.ClearBatchHistory(cfg)},
		{"DELETE /api/catalog/workshop-batches/{id}", true, workshop.DeleteBatch(cfg)},
		{"GET /api/catalog/workshop-workspace", true, workshop.WorkspaceGet(cfg)},
		{"PUT /api/catalog/workshop-workspace", true, workshop.WorkspacePut(cfg)},
		{"POST /api/generate/upload-ref", true, generate.UploadRef()},
		{"POST /api/generate/canvas-text", true, generate.CanvasText(cfg)},
		{"POST /api/generate/layer-decomposition", true, generate.LayerDecomposition(cfg)},
		{"POST /api/generate/headline-title", true, generate.HeadlineTitle(cfg)},
		{"POST /api/generate/headline-design", true, generate.HeadlineDesign(cfg)},
		{"POST /api/generate/analyze", true, generate.Analyze(cfg)},
		{"POST /api/generate/copywriting", true, generate.Copywriting(cfg)},
		{"POST /api/generate/image", true, generate.Image(cfg)},
		{"GET /api/generate/image", true, generate.Image(cfg)},
		{"POST /api/generate/video", true, generate.Video(cfg)},
		{"GET /api/generate/video", true, generate.Video(cfg)},
		{"POST /api/generate/depth-image", true, generate.DepthImage(cfg)},
		{"POST /api/generate/depth-video", true, generate.DepthVideo(cfg)},
		{"GET /api/generate/depth-video", true, generate.DepthVideo(cfg)},
		{"GET /api/generate/depth-image", true, generate.DepthImage(cfg)},
		{"POST /api/generate/export-zip", true, generate.ExportZip(cfg)},
		{"POST /api/workshop/tasks/{taskId}/review", true, workshop.Review(cfg)},
	}
}

// NativePatterns lists Go-owned API routes for the OpenAPI contract test.
func NativePatterns() []string {
	patterns := make([]string, 0, len(nativeRoutes(config.Config{})))
	for _, route := range nativeRoutes(config.Config{}) {
		patterns = append(patterns, route.pattern)
	}
	return patterns
}

func New(cfg config.Config) http.Handler {
	mux := http.NewServeMux()
	for _, route := range nativeRoutes(cfg) {
		handler := route.handler
		if route.protected {
			handler = protect(cfg, handler)
		}
		mux.Handle(route.pattern, handler)
	}
	mux.Handle("/api/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "接口不存在"})
	}))
	mux.Handle("/storage/", assets.Storage(cfg))
	if cfg.WebDistDir != "" {
		mux.Handle("/", staticHandler(cfg))
	}
	return withRequestID(mux)
}

func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.Header.Get("x-request-id"))
		if id == "" {
			id = httpx.RequestID()
			r.Header.Set("x-request-id", id)
		}
		started := time.Now()
		wrapped := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		wrapped.Header().Set("x-request-id", id)
		next.ServeHTTP(wrapped, r)
		log.Printf("[API] %s %s %d %s", r.Method, r.URL.Path, wrapped.status, time.Since(started).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
