package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
)

type deconstructHooks struct {
	beforeDispatch func() (bool, error)
	onProgress     func(deconstructProgress)
}

func executeDeconstruct(cfg config.Config, r *http.Request, payload map[string]any, hooks deconstructHooks) (int, map[string]any) {
	protocol, protocolErr := generate.RequestTextProtocol(r, payload)
	if protocolErr != nil {
		return http.StatusBadRequest, map[string]any{"success": false, "error": protocolErr.Error()}
	}
	r = r.WithContext(modelgw.WithTextProtocol(r.Context(), protocol))
	images := stringList(payload["imageUrls"])
	workspace := httpx.WorkspaceFrom(r)
	taskID, _ := payload["clientTaskId"].(string)
	if len(taskID) > 160 {
		taskID = ""
	}
	report := func(stage, message string) {
		progress := updateDeconstructProgress(workspace, taskID, stage, message)
		if hooks.onProgress != nil && taskID != "" {
			hooks.onProgress(progress)
		}
	}
	baseURL, apiKey := deconstructCreds(cfg, r, payload)
	if strings.TrimSpace(apiKey) == "" {
		report("failed", "反推未完成，请查看任务错误信息")
		return http.StatusBadRequest, map[string]any{"error": "系统尚未配置 AI 视觉接口密钥，请在设置中填入"}
	}
	model := strings.TrimSpace(stringValue(payload["model"]))
	if model == "" {
		model = "gpt-5.6-luna"
	}
	if !deconstructVisionReady(map[string]any{"model": model, "apiFormat": payload["apiFormat"]}) {
		report("failed", "反推未完成，请查看任务错误信息")
		return http.StatusBadRequest, map[string]any{"error": "请先在设置中配置支持图像输入的多模态模型"}
	}
	fullPrompt, _ := payload["fullPromptOnly"].(bool)
	reviewBefore, _ := payload["reviewBeforeSave"].(bool)
	category := deconstructCategoryValue(payload)
	parent := stringValue(payload["parentFullPromptId"])
	sub := stringValue(payload["targetSubcategory"])
	reviewID := deconstructReviewID(workspace, images, fullPrompt, category, parent, sub)
	if reviewBefore || len(images) >= 4 {
		if existing, ok := existingReview(cfg, r, reviewID); ok {
			return http.StatusOK, existing
		}
	}
	report("preparing", "正在准备 "+strconv.Itoa(len(images))+" 张图片")
	prepared, originals, err := prepareDeconstructImages(cfg, images)
	if err != nil || len(prepared) == 0 {
		report("failed", "反推未完成，请查看任务错误信息")
		return http.StatusBadRequest, map[string]any{"error": "原贴图片下载受限或已失效，请检查原贴链接或重试", "code": "IMAGE_DOWNLOAD_FAILED"}
	}
	report("queued", "图片准备完成，等待视觉模型")
	if hooks.beforeDispatch != nil {
		allowed, err := hooks.beforeDispatch()
		if err != nil {
			report("failed", "反推未完成，请查看任务错误信息")
			return http.StatusInternalServerError, map[string]any{"success": false, "error": "后台进度保存失败，请核对已派发请求的结果", "code": "internal_error"}
		}
		if !allowed {
			report("failed", "反推未完成，请查看任务错误信息")
			return http.StatusConflict, map[string]any{"success": false, "error": "已停止，未派发模型请求", "code": "job_stopped"}
		}
	}
	report("analyzing", "正在等待 "+model+" 分析图片")
	hint := stringValue(payload["userHint"])
	outcome := callDeconstructVision(r.Context(), baseURL, apiKey, model, prepared, deconstructPrompt(len(prepared), hint, category))
	if outcome.Fail != nil {
		report("failed", "反推未完成，请查看任务错误信息")
		return outcome.Code, scrubSecrets(outcome.Fail, apiKey)
	}
	parsed, perImage, err := parseVisionJSON(outcome.Text)
	if err != nil {
		report("failed", "反推未完成，请查看任务错误信息")
		return http.StatusBadGateway, map[string]any{"error": "视觉模型解构失败，请检查模型配置或稍后重试", "detail": map[string]any{"pipelineStage": "unified_failed", "modelsTried": []string{model}}}
	}
	report("reconciling", "正在整理反推结果")
	album := firstString(payload["albumName"], payload["productTitle"], trimHint(hint), "导入图集")
	body := map[string]any{
		"success": true, "partial": false, "usedModel": outcome.Model, "pipelineMode": "single_vision_pass",
		"data": parsed, "savedRecords": map[string]any{"scenes": []any{}, "outfits": []any{}, "actions": []any{}, "fullPrompts": []any{}},
		"stats": map[string]any{"imageCount": len(prepared), "perImageCount": len(perImage), "pass2Skipped": true, "pipelineMode": "single_vision_pass", "shardCount": 1, "visionCallCount": 1},
	}
	if reviewBefore || len(prepared) >= 4 {
		if fullPrompt && (len(prepared) != 4 || len(perImage) != 4) {
			report("failed", "反推未完成，请查看任务错误信息")
			return http.StatusUnprocessableEntity, map[string]any{"error": "四张成图未能提炼为完整母本，本次未入库，请检查后重试"}
		}
		resolvedCategory := category
		if resolvedCategory == "" {
			inferred := stringValue(parsed["product_major_category"])
			if inferred == "jewelry" {
				inferred = "jewelry_luxury"
			}
			resolvedCategory, _ = resolveMajorCategory(cfg, r, inferred)
		}
		stored := map[string]any{
			"parsedResult": parsed, "perImageResults": perImage, "imageUrls": originals, "albumName": album,
			"isSingleImage": len(prepared) == 1, "category": firstString(parsed["theme_category"], "general"),
			"fullPromptOnly": fullPrompt, "provenance": "deconstructed", "parentFullPromptId": parent,
			"targetProductCategory": resolvedCategory, "targetSubcategory": sub,
		}
		if fullPrompt {
			stored["provenance"] = "workshop_generated"
		}
		raw, _ := json.Marshal(stored)
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			return http.StatusInternalServerError, map[string]any{"success": false, "error": "参考样本保存失败，请核对审核队列"}
		}
		defer db.Close()
		if err := dblibrary.InsertDeconstructReview(r.Context(), db, workspace, reviewID, album, string(raw)); err != nil {
			return http.StatusInternalServerError, map[string]any{"success": false, "error": "参考候选保存失败"}
		}
		body["previewShots"], body["reviewId"], body["reviewStatus"] = perImage, reviewID, "pending"
		if !reviewBefore {
			drafts, draftErr := deconstructGroupDrafts(stored)
			if draftErr != nil {
				return http.StatusUnprocessableEntity, map[string]any{"error": draftErr.Error(), "reviewId": reviewID}
			}
			ids, saveErr := dblibrary.CommitDeconstructGroups(r.Context(), db, workspace, reviewID, drafts)
			if saveErr != nil {
				return http.StatusInternalServerError, map[string]any{"error": "反推已完成，样本入库失败，候选已保留：" + saveErr.Error(), "reviewId": reviewID}
			}
			body["fullPromptIds"], body["reviewStatus"] = ids, "approved"
			records := []any{}
			for _, id := range ids {
				records = append(records, map[string]any{"id": id})
			}
			body["savedRecords"].(map[string]any)["fullPrompts"] = records
			body["stats"].(map[string]any)["fullPromptsCount"] = len(ids)
		}
	}
	report("completed", "反推完成")
	return http.StatusOK, scrubSecrets(body, apiKey)
}

func deconstructCreds(cfg config.Config, r *http.Request, payload map[string]any) (string, string) {
	model := stringValue(payload["model"])
	if strings.HasPrefix(model, "deepseek-official:") {
		return "https://api.deepseek.com", firstString(payload["customApiKey"], r.Header.Get("x-custom-api-key"))
	}
	base := firstString(payload["customBaseUrl"], r.Header.Get("x-custom-base-url"), os.Getenv("AI_DRAWING_BASE_URL"), "https://ai.comfly.org")
	key := firstString(payload["customApiKey"], r.Header.Get("x-custom-api-key"))
	if key == "" && !cfg.Production() {
		key = firstString(os.Getenv("AI_DRAWING_API_KEY"), os.Getenv("AI_API_KEY"))
	}
	return strings.TrimRight(strings.TrimSpace(base), "/"), strings.TrimSpace(key)
}

func prepareDeconstructImages(cfg config.Config, images []string) ([]string, []string, error) {
	selected := images
	if len(images) != 1 {
		keep := len(images)
		if keep > 10 {
			keep = 10
		}
		keep = keep / 4 * 4
		selected = images[:keep]
	}
	var prepared, originals []string
	for _, image := range selected {
		data, err := loadDeconstructImage(cfg, image)
		if err != nil || data == "" {
			if len(selected) == 1 {
				return nil, nil, err
			}
			continue
		}
		prepared = append(prepared, data)
		originals = append(originals, image)
	}
	if len(selected) > 1 {
		prepared, originals = completeGroups(prepared, originals)
	}
	return prepared, originals, nil
}

func completeGroups(prepared, originals []string) ([]string, []string) {
	keep := len(prepared) / 4 * 4
	return prepared[:keep], originals[:keep]
}

func loadDeconstructImage(cfg config.Config, image string) (string, error) {
	if strings.HasPrefix(image, "data:image/") {
		return image, nil
	}
	if strings.HasPrefix(image, "/storage/") {
		relative := strings.TrimPrefix(image, "/storage/")
		body, err := os.ReadFile(filepath.Join(depthStorageFrom(cfg), filepath.FromSlash(relative)))
		if err != nil {
			return "", err
		}
		return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(body), nil
	}
	if !strings.HasPrefix(image, "https://") && !strings.HasPrefix(image, "http://") {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, image, nil)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", nil
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil || len(body) == 0 {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(body), nil
}

func depthStorageFrom(cfg config.Config) string {
	if cache := os.Getenv("AZHUO_CACHE_DIR"); cache != "" {
		return cache
	}
	if data := cfg.DataDir(); data != "" {
		return filepath.Join(data, "storage")
	}
	if file := cfg.SQLiteFile(); file != "" {
		return filepath.Join(filepath.Dir(file), "storage")
	}
	return ""
}

func existingReview(cfg config.Config, r *http.Request, id string) (map[string]any, bool) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, false
	}
	defer db.Close()
	_, payload, status, ok, err := dblibrary.GetDeconstructReview(r.Context(), db, httpx.WorkspaceFrom(r), id)
	if err != nil || !ok {
		return nil, false
	}
	var stored map[string]any
	if json.Unmarshal([]byte(payload), &stored) != nil {
		return nil, false
	}
	return map[string]any{"success": true, "data": stored["parsedResult"], "previewShots": stored["perImageResults"], "reviewId": id, "reviewStatus": status, "fullPromptIds": stored["fullPromptIds"], "reused": true}, true
}

func deconstructReviewID(workspace string, images []string, full bool, category, parent, sub string) string {
	parts := []any{workspace, images, full, category}
	if full && parent != "" {
		parts = append(parts, parent)
	}
	if sub != "" {
		parts = append(parts, sub)
	}
	raw, _ := json.Marshal(parts)
	sum := sha256.Sum256(raw)
	return "review_" + hex.EncodeToString(sum[:])[:40]
}

func stringList(value any) []string {
	items, _ := value.([]any)
	out := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if ok && strings.TrimSpace(text) != "" {
			out = append(out, text)
		}
	}
	return out
}

func stringValue(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func firstString(values ...any) string {
	for _, value := range values {
		if text := stringValue(value); text != "" {
			return text
		}
	}
	return ""
}

func trimHint(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 40 {
		return value[:40]
	}
	return value
}

func scrubSecrets(value map[string]any, apiKey string) map[string]any {
	raw, _ := json.Marshal(value)
	text := scrubText(string(raw), apiKey)
	var out map[string]any
	_ = json.Unmarshal([]byte(text), &out)
	return out
}

func scrubText(value, apiKey string) string {
	if apiKey != "" {
		value = strings.ReplaceAll(value, apiKey, "[密钥已隐藏]")
	}
	return value
}

// DeconstructImageURL runs the in-process image reverse prompt used by the assistant.
func DeconstructImageURL(cfg config.Config, workspace, imageURL, apiKey, baseURL string) (int, map[string]any) {
	req, err := http.NewRequest(http.MethodPost, "http://assistant.local/deconstruct", nil)
	if err != nil {
		return http.StatusInternalServerError, map[string]any{"error": err.Error()}
	}
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	payload := map[string]any{"imageUrls": []string{imageURL}, "mode": "single", "customApiKey": apiKey, "customBaseUrl": baseURL}
	return executeDeconstruct(cfg, req, payload, deconstructHooks{})
}
