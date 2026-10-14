package system

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const maxVideoDownloadItems = 500

type videoDownloadRequest struct {
	Directory   string              `json:"directory"`
	Concurrency int                 `json:"concurrency"`
	Items       []videoDownloadItem `json:"items"`
}

func PickVideoDirectory(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !videoDownloadAuthorized(w, r, cfg) {
			return
		}
		directory, err := pickVideoDirectory(r.Context())
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "directory": directory})
	})
}

func StartVideoDownload(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !videoDownloadAuthorized(w, r, cfg) {
			return
		}
		payload, message := decodeVideoDownload(w, r, cfg)
		if message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		job := newVideoDownloadJob(payload.Directory, payload.Concurrency, payload.Items)
		job.cancel = cancel
		job.running = true
		storeVideoDownloadJob(job)
		go job.run(ctx, cfg)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "jobId": job.id})
	})
}

func VideoDownloadStatus(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !videoDownloadAuthorized(w, r, cfg) {
			return
		}
		job, ok := lookupVideoDownloadJob(r.PathValue("jobId"))
		if !ok {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "下载任务不存在"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, job.snapshot())
	})
}

func CancelVideoDownload(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !videoDownloadAuthorized(w, r, cfg) {
			return
		}
		job, ok := lookupVideoDownloadJob(r.PathValue("jobId"))
		if !ok {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "下载任务不存在"})
			return
		}
		if job.cancel != nil {
			job.cancel()
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	})
}

func videoDownloadAuthorized(w http.ResponseWriter, r *http.Request, cfg config.Config) bool {
	if cfg.AccessToken == "" {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "服务端未配置访问令牌，请联系管理员"})
		return false
	}
	if !proxyAuthorized(r, cfg) {
		httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "未授权：缺少有效的访问凭证或媒体签名"})
		return false
	}
	return true
}

func decodeVideoDownload(w http.ResponseWriter, r *http.Request, cfg config.Config) (videoDownloadRequest, string) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	var payload videoDownloadRequest
	if err := decoder.Decode(&payload); err != nil {
		return payload, "下载请求无法读取"
	}
	directory, err := cleanVideoDirectory(payload.Directory)
	if err != nil {
		return payload, err.Error()
	}
	concurrency, ok := videoConcurrency(payload.Concurrency)
	if !ok {
		return payload, "并发只能选择 100"
	}
	if len(payload.Items) == 0 || len(payload.Items) > maxVideoDownloadItems {
		return payload, "没有可下载的视频"
	}
	seen := map[string]struct{}{}
	for index := range payload.Items {
		item := &payload.Items[index]
		if _, err = safeVideoDestination(directory, item.Filename); err != nil {
			return payload, err.Error()
		}
		key := strings.ToLower(item.Filename)
		if _, exists := seen[key]; exists {
			return payload, "文件名重复"
		}
		seen[key] = struct{}{}
		if _, status, message := normalizeVideoProxyURL(cfg, item.URL); status != 0 {
			return payload, message
		}
		item.Status = "pending"
		item.Error = ""
	}
	payload.Directory = directory
	payload.Concurrency = concurrency
	return payload, ""
}
