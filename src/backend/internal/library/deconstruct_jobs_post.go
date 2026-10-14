package library

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const deconstructBodyLimit = 84_000_000

func deconstructJobsPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, deconstructBodyLimit+1))
		if err != nil || len(body) == 0 || len(body) > deconstructBodyLimit {
			writeJobError(w, http.StatusRequestEntityTooLarge, "本批图集数据过大，请减少图集数量", "job_body_too_large")
			return
		}
		if !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			writeJobError(w, http.StatusBadRequest, "后台反推参数无效", "invalid_job_submission")
			return
		}
		if _, stop := payload["action"]; stop {
			if deconstructStopError(payload) {
				writeJobError(w, http.StatusBadRequest, "停止任务参数无效", "invalid_job_stop")
				return
			}
			stopDeconstructJobs(cfg, w, r, body)
			return
		}
		if message := deconstructSubmitError(payload); message != "" {
			writeJobError(w, http.StatusBadRequest, message, "invalid_job_submission")
			return
		}
		submitDeconstructJobs(cfg, w, r, body)
	}
}

func deconstructStopError(payload map[string]json.RawMessage) bool {
	var action string
	if json.Unmarshal(payload["action"], &action) != nil || action != "stop" {
		return true
	}
	return !validIdentifier(payload["jobId"])
}

func deconstructSubmitError(payload map[string]json.RawMessage) string {
	if !validIdentifier(payload["jobId"]) {
		if _, ok := payload["jobId"]; !ok {
			return "Required"
		}
		return rawStringError(payload["jobId"], 160, true)
	}
	itemsRaw, ok := payload["items"]
	if !ok {
		return "Required"
	}
	if rawKind(itemsRaw) != "array" {
		return "Expected array, received " + rawKind(itemsRaw)
	}
	var items []json.RawMessage
	if json.Unmarshal(itemsRaw, &items) != nil {
		return "Expected array, received array"
	}
	if len(items) < 1 {
		return "Array must contain at least 1 element(s)"
	}
	if len(items) > 200 {
		return "Array must contain at most 200 element(s)"
	}
	seen := map[string]struct{}{}
	ids := make([]string, 0, len(items))
	imageBytes := 0
	for _, itemRaw := range items {
		message, id, images := deconstructItemError(itemRaw)
		if message != "" {
			return message
		}
		ids = append(ids, id)
		seen[id] = struct{}{}
		imageBytes += images
	}
	if len(seen) != len(ids) {
		return "图集任务 ID 不能重复"
	}
	if imageBytes > 80_000_000 {
		return "本批图片数据过大，请减少图集数量"
	}
	if message := optionalRawString(payload, "userHint", 20_000); message != "" {
		return message
	}
	if message := optionalRawString(payload, "model", 200); message != "" {
		return message
	}
	if message := optionalStringList(payload, "fallbackOrder", 30, 200); message != "" {
		return message
	}
	if message := optionalInt(payload, "concurrency", 1, 16); message != "" {
		return message
	}
	if message := optionalRawBool(payload, "reviewBeforeSave"); message != "" {
		return message
	}
	return overridesError(payload["overrides"])
}

func deconstructItemError(raw json.RawMessage) (string, string, int) {
	var item map[string]json.RawMessage
	if json.Unmarshal(raw, &item) != nil {
		return "Expected object, received " + rawKind(raw), "", 0
	}
	if !validIdentifier(item["id"]) {
		if _, ok := item["id"]; !ok {
			return "Required", "", 0
		}
		return rawStringError(item["id"], 160, true), "", 0
	}
	if message := rawStringError(item["name"], 500, true); message != "" {
		if _, ok := item["name"]; !ok {
			return "Required", "", 0
		}
		return message, "", 0
	}
	imagesRaw, ok := item["images"]
	if !ok {
		return "Required", "", 0
	}
	if rawKind(imagesRaw) != "array" {
		return "Expected array, received " + rawKind(imagesRaw), "", 0
	}
	var images []string
	if json.Unmarshal(imagesRaw, &images) != nil {
		return "Expected string, received " + imageElementKind(imagesRaw), "", 0
	}
	if len(images) < 1 {
		return "Array must contain at least 1 element(s)", "", 0
	}
	if len(images) > 10 {
		return "Array must contain at most 10 element(s)", "", 0
	}
	total := 0
	for _, image := range images {
		if strings.TrimSpace(image) == "" {
			return "String must contain at least 1 character(s)", "", 0
		}
		if len(image) > 28_000_000 {
			return "String must contain at most 28000000 character(s)", "", 0
		}
		total += len(image)
	}
	for _, key := range []string{"targetCategory", "targetSubcategory"} {
		limit := 200
		if key == "targetSubcategory" {
			limit = 300
		}
		if message := optionalRawString(item, key, limit); message != "" {
			return message, "", 0
		}
	}
	var id string
	_ = json.Unmarshal(item["id"], &id)
	return "", strings.TrimSpace(id), total
}

func validIdentifier(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return false
	}
	trimmed := strings.TrimSpace(value)
	return trimmed != "" && len(trimmed) <= 160
}

func rawStringError(raw json.RawMessage, max int, required bool) string {
	if len(raw) == 0 {
		if required {
			return "Required"
		}
		return ""
	}
	if rawKind(raw) != "string" {
		return "Expected string, received " + rawKind(raw)
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "Expected string, received string"
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "String must contain at least 1 character(s)"
	}
	if len(value) > max {
		return "String must contain at most " + strconv.Itoa(max) + " character(s)"
	}
	return ""
}

func optionalRawString(payload map[string]json.RawMessage, key string, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "string" {
		return "Expected string, received " + rawKind(raw)
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "Expected string, received string"
	}
	if len(value) > max {
		return "String must contain at most " + strconv.Itoa(max) + " character(s)"
	}
	return ""
}

func optionalRawBool(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "boolean" {
		return "Expected boolean, received " + rawKind(raw)
	}
	return ""
}

func optionalInt(payload map[string]json.RawMessage, key string, min int, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "number" {
		return "Expected number, received " + rawKind(raw)
	}
	var value float64
	if json.Unmarshal(raw, &value) != nil || value != float64(int(value)) {
		return "Expected integer, received float"
	}
	if int(value) < min {
		return "Number must be greater than or equal to " + strconv.Itoa(min)
	}
	if int(value) > max {
		return "Number must be less than or equal to " + strconv.Itoa(max)
	}
	return ""
}

func optionalStringList(payload map[string]json.RawMessage, key string, maxItems int, maxText int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "array" {
		return "Expected array, received " + rawKind(raw)
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return "Expected array, received array"
	}
	if len(items) > maxItems {
		return "Array must contain at most " + strconv.Itoa(maxItems) + " element(s)"
	}
	for _, item := range items {
		if message := rawStringError(item, maxText, true); message != "" {
			return message
		}
	}
	return ""
}

func overridesError(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if rawKind(raw) != "object" {
		return "Expected object, received " + rawKind(raw)
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return "Expected object, received object"
	}
	limits := []struct {
		key   string
		limit int
	}{{"customBaseUrl", 2048}, {"customApiKey", 4096}, {"apiFormat", 100}}
	for _, field := range limits {
		if message := optionalRawString(fields, field.key, field.limit); message != "" {
			return message
		}
	}
	return optionalRawBool(fields, "allowInsecureHttp")
}

func imageElementKind(raw json.RawMessage) string {
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil || len(items) == 0 {
		return "array"
	}
	return rawKind(items[0])
}

func rawKind(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	switch {
	case text == "" || text == "null":
		return "null"
	case text == "true" || text == "false":
		return "boolean"
	case strings.HasPrefix(text, "\""):
		return "string"
	case strings.HasPrefix(text, "["):
		return "array"
	case strings.HasPrefix(text, "{"):
		return "object"
	default:
		return "number"
	}
}

func writeJobError(w http.ResponseWriter, status int, message string, code string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message, "code": code})
}
