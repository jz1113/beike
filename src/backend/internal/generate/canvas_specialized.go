package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/submission"
)

const canvasSpecializedReceipt = "canvas-specialized"
const runningHubBase = "https://www.runninghub.cn"
const meshyBase = "https://api.meshy.ai"

var specializedID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var runningHubID = regexp.MustCompile(`^[0-9]{1,32}$`)

type specializedField struct {
	NodeID string `json:"nodeId"`
	Name   string `json:"fieldName"`
	Value  string `json:"fieldValue"`
}

type specializedInput struct {
	Kind          string             `json:"kind"`
	Target        string             `json:"target"`
	Fields        []specializedField `json:"fields"`
	Prompt        string             `json:"prompt"`
	Image         string             `json:"image"`
	Images        []string           `json:"images"`
	Model         string             `json:"model"`
	Material      string             `json:"material"`
	SourceFileURL string             `json:"sourceFileUrl"`
	CustomBaseURL string             `json:"customBaseUrl"`
	CustomAPIKey  string             `json:"customApiKey"`
	Textured      bool               `json:"textured"`
	Resolution    string             `json:"resolution"`
	Detail        *int               `json:"detail"`
}

func specializedError(w http.ResponseWriter, status int, message string, rejected bool) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message, "submissionRejected": rejected, "submissionUnknown": !rejected})
}

func specializedJSON(ctx context.Context, client *http.Client, method, endpoint, key, contentType string, body io.Reader) (map[string]any, int) {
	r, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, 0
	}
	if key != "" {
		r.Header.Set("Authorization", "Bearer "+key)
	}
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	response, err := client.Do(r)
	if err != nil {
		return nil, 0
	}
	defer response.Body.Close()
	var data map[string]any
	if json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&data) != nil {
		return nil, response.StatusCode
	}
	return data, response.StatusCode
}

func specializedPost(ctx context.Context, client *http.Client, endpoint, key string, body map[string]any) (map[string]any, int) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, 0
	}
	return specializedJSON(ctx, client, http.MethodPost, endpoint, key, "application/json", bytes.NewReader(raw))
}

func specializedHTTPS(value any) string {
	raw, _ := value.(string)
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return ""
	}
	return raw
}

func specializedString(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return value
}

func specializedMedia(raw string, imageOnly bool) ([]byte, string) {
	meta, encoded, ok := strings.Cut(raw, ",")
	formats := map[string]string{
		"data:image/png;base64": "png", "data:image/jpeg;base64": "jpg", "data:image/webp;base64": "webp",
		"data:video/mp4;base64": "mp4", "data:video/webm;base64": "webm", "data:video/quicktime;base64": "mov",
		"data:audio/mpeg;base64": "mp3", "data:audio/wav;base64": "wav", "data:audio/ogg;base64": "ogg",
	}
	ext := formats[meta]
	if imageOnly && !strings.HasPrefix(meta, "data:image/") {
		return nil, ""
	}
	if !ok || ext == "" || len(encoded) > base64.StdEncoding.EncodedLen(6<<20) {
		return nil, ""
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 {
		return nil, ""
	}
	return data, ext
}

func uploadRunningHubMedia(ctx context.Context, client *http.Client, key, raw string) string {
	data, ext := specializedMedia(raw, false)
	if ext == "" {
		return ""
	}
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if form.WriteField("apiKey", key) != nil || form.WriteField("fileType", "input") != nil {
		return ""
	}
	part, err := form.CreateFormFile("file", "canvas."+ext)
	if err != nil {
		return ""
	}
	if _, err = part.Write(data); err != nil {
		return ""
	}
	if form.Close() != nil {
		return ""
	}
	result, code := specializedJSON(ctx, client, http.MethodPost, runningHubBase+"/task/openapi/upload", "", form.FormDataContentType(), &body)
	if code != 200 || result["code"] != float64(0) {
		return ""
	}
	value, _ := result["data"].(map[string]any)
	return specializedString(value, "fileName")
}

func CanvasSpecialized(cfg config.Config) http.Handler {
	client := network.SafeClient()
	client.Timeout = 70 * time.Second
	// Provider credentials are scoped to fixed hosts and are never sent on redirects.
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	return canvasSpecialized(cfg, client)
}

func canvasSpecialized(cfg config.Config, client *http.Client) http.Handler {
	start := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input specializedInput
		if json.NewDecoder(r.Body).Decode(&input) != nil {
			specializedError(w, 400, "节点参数格式无效", true)
			return
		}
		var task, mode, statusURL, responseURL string
		var code int
		switch input.Kind {
		case "rh-app", "rh-comfy":
			key := strings.TrimSpace(os.Getenv("RUNNINGHUB_API_KEY"))
			if key == "" {
				specializedError(w, 503, "服务器尚未配置 RUNNINGHUB_API_KEY", true)
				return
			}
			if !runningHubID.MatchString(input.Target) || len(input.Fields) > 32 {
				specializedError(w, 400, "请填写有效的 RunningHub ID，最多 32 个参数", true)
				return
			}
			for _, field := range input.Fields {
				if !specializedID.MatchString(field.NodeID) || !specializedID.MatchString(field.Name) || (len(field.Value) > 32000 && !strings.HasPrefix(field.Value, "data:")) {
					specializedError(w, 400, "RunningHub 节点参数无效", true)
					return
				}
			}
			uploads := map[string]string{}
			for index := range input.Fields {
				value := input.Fields[index].Value
				if strings.HasPrefix(value, "data:") {
					name := uploads[value]
					if name == "" {
						name = uploadRunningHubMedia(r.Context(), client, key, value)
						if name == "" {
							specializedError(w, 422, "RunningHub 素材上传失败，请检查素材格式、大小及账号权限", true)
							return
						}
						uploads[value] = name
					}
					input.Fields[index].Value = name
				}
			}
			path, field := "/task/openapi/ai-app/run", "webappId"
			if input.Kind == "rh-comfy" {
				path, field = "/task/openapi/create", "workflowId"
			}
			fields := input.Fields
			if fields == nil {
				fields = []specializedField{}
			}
			result, status := specializedPost(r.Context(), client, runningHubBase+path, key, map[string]any{"apiKey": key, field: input.Target, "nodeInfoList": fields})
			code = status
			if code == 200 && result["code"] != nil && result["code"] != float64(0) {
				specializedError(w, 422, "RunningHub 拒绝任务，请检查 ID、参数及账号权限", true)
				return
			}
			data, _ := result["data"].(map[string]any)
			task = specializedString(data, "taskId")
		case "jimeng-super-resolution":
			var proceed bool
			task, code, proceed = submitJimeng(w, r, client, input)
			if !proceed {
				return
			}
		case "gen-3d":
			meshyKey := strings.TrimSpace(os.Getenv("MESHY_API_KEY"))
			useLegacyMeshy := strings.TrimSpace(input.Model) == "" && meshyKey != "" &&
				strings.TrimSpace(input.CustomAPIKey) == "" && strings.TrimSpace(r.Header.Get("x-custom-api-key")) == ""
			if useLegacyMeshy {
				mode = "/openapi/v2/text-to-3d"
				body := map[string]any{"target_formats": []string{"glb"}}
				if input.Image != "" {
					if _, ext := specializedMedia(input.Image, true); ext == "" {
						specializedError(w, 400, "请连接 PNG、JPEG 或 WebP 图片（最多 6 MB）", true)
						return
					}
					mode = "/openapi/v1/image-to-3d"
					body["image_url"], body["should_texture"] = input.Image, input.Textured
				} else {
					prompt := strings.TrimSpace(input.Prompt)
					if prompt == "" || utf8.RuneCountInString(prompt) > 800 {
						specializedError(w, 400, "请输入 1–800 字的 3D 描述", true)
						return
					}
					body["mode"], body["prompt"] = "preview", prompt
				}
				result, status := specializedPost(r.Context(), client, meshyBase+mode, meshyKey, body)
				code, task = status, specializedString(result, "result")
			} else {
				var proceed bool
				task, mode, statusURL, responseURL, code, proceed = submitFal3D(cfg, w, r, client, input)
				if !proceed {
					return
				}
			}
		default:
			specializedError(w, 400, "未知节点类型", true)
			return
		}
		if !specializedID.MatchString(task) {
			rejected := code >= 400 && code < 500 && code != 408
			specializedError(w, 502, "服务未返回任务 ID，请在提供方任务记录核对", rejected)
			return
		}
		reply := map[string]any{"success": true, "kind": input.Kind, "mode": mode, "taskId": task}
		if statusURL != "" {
			reply["statusUrl"] = statusURL
		}
		if responseURL != "" {
			reply["responseUrl"] = responseURL
		}
		httpx.WriteJSON(w, 200, reply)
	})
	guarded := submission.GuardWithOptions(cfg.SQLiteFile(), canvasSpecializedReceipt, submission.GuardOptions{MaxBytes: 12 << 20, Timeout: 3 * time.Minute}, start)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Query().Get("status") != "1" {
			guarded.ServeHTTP(w, r)
			return
		}
		operation := r.URL.Query().Get("operationKey")
		if !specializedID.MatchString(operation) {
			specializedError(w, 400, "缺少操作标识", true)
			return
		}
		receipt, err := submission.Read(r.Context(), cfg.SQLiteFile(), httpx.WorkspaceFrom(r), canvasSpecializedReceipt, operation)
		if err != nil || receipt.Body["success"] != true {
			guarded.ServeHTTP(w, r)
			return
		}
		task, kind, mode := specializedString(receipt.Body, "taskId"), specializedString(receipt.Body, "kind"), specializedString(receipt.Body, "mode")
		if !specializedID.MatchString(task) {
			specializedError(w, 502, "任务回执缺少任务标识", false)
			return
		}
		querySpecialized(cfg, w, r, client, task, kind, mode, receipt.Body)
	})
}

func querySpecialized(cfg config.Config, w http.ResponseWriter, r *http.Request, client *http.Client, task, kind, mode string, receiptBody map[string]any) {
	if kind == "jimeng-super-resolution" {
		queryJimeng(w, r, client, task)
		return
	}
	if kind == "gen-3d" && strings.HasPrefix(mode, "fal:") {
		queryFal3D(cfg, w, r, client, task, mode, receiptBody)
		return
	}
	result := map[string]any{"success": true, "taskId": task, "status": "pending"}
	var data map[string]any
	var code int
	if kind == "gen-3d" {
		key := strings.TrimSpace(os.Getenv("MESHY_API_KEY"))
		if key == "" || (mode != "/openapi/v1/image-to-3d" && mode != "/openapi/v2/text-to-3d") {
			specializedError(w, 503, "3D 服务配置不可用", false)
			return
		}
		data, code = specializedJSON(r.Context(), client, http.MethodGet, meshyBase+mode+"/"+task, key, "", nil)
		if data["status"] == "SUCCEEDED" {
			urls, _ := data["model_urls"].(map[string]any)
			result["modelUrl"] = specializedHTTPS(urls["glb"])
			result["imageUrl"] = specializedHTTPS(data["thumbnail_url"])
			if result["modelUrl"] != "" {
				result["status"] = "done"
			}
		}
	} else {
		key := strings.TrimSpace(os.Getenv("RUNNINGHUB_API_KEY"))
		if key == "" {
			specializedError(w, 503, "RunningHub 服务配置不可用", false)
			return
		}
		data, code = specializedPost(r.Context(), client, runningHubBase+"/openapi/v2/query", key, map[string]any{"taskId": task})
		if data["status"] == "SUCCESS" {
			var outputs []map[string]string
			items, _ := data["results"].([]any)
			for _, item := range items {
				value, _ := item.(map[string]any)
				if link := specializedHTTPS(value["url"]); link != "" {
					outputs = append(outputs, map[string]string{"url": link, "extension": specializedString(value, "outputType")})
				}
			}
			if len(outputs) > 0 {
				result["status"], result["outputs"] = "done", outputs
			}
		}
	}
	if code != 200 || data == nil {
		specializedError(w, 502, "查询服务暂不可用，可继续查询原任务", false)
		return
	}
	switch data["status"] {
	case "FAILED", "CANCELED", "CANCELLED":
		result["status"] = "failed"
	case "SUCCESS", "SUCCEEDED":
		if result["status"] != "done" {
			specializedError(w, 502, "任务完成但没有可用的输出文件", false)
			return
		}
	}
	httpx.WriteJSON(w, 200, result)
}
