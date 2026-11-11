package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"beike.local/cloud/src/backend/internal/system"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

func CanvasText(cfg config.Config) http.Handler {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		var ok bool
		r, ok = BindTextProtocol(w, r, payload)
		if !ok {
			return
		}
		model, _ := payload["model"].(string)
		prompt, _ := payload["prompt"].(string)
		messages, chat := payload["messages"].([]any)
		if strings.TrimSpace(model) == "" || utf8.RuneCountInString(strings.TrimSpace(model)) > 200 || (chat && (len(messages) == 0 || len(messages) > 512)) || (!chat && (strings.TrimSpace(prompt) == "" || utf8.RuneCountInString(strings.TrimSpace(prompt)) > 20000)) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		if message := unsafeCanvasGateway(cfg, r, payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		if chat {
			writeCanvasChat(cfg, w, r, payload)
			return
		}
		writeCanvasText(cfg, w, r, payload, body)
	})
	options := submission.GuardOptions{MaxBytes: 32 << 20, Timeout: 8 * time.Minute}
	guarded := submission.GuardWithOptions(cfg.SQLiteFile(), "canvas-text", options, submission.GuardWithOptions(cfg.SQLiteFile(), "canvas-text-result", options, next))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			recoverCanvasText(cfg, w, r)
			return
		}
		if r.Method == http.MethodPost && r.URL.Query().Get("closeMissing") == "1" {
			key := strings.TrimSpace(r.URL.Query().Get("operationKey"))
			if key == "" || len(key) > 256 {
				httpx.WriteJSON(w, 400, map[string]any{"submissionUnknown": true, "error": "缺少有效的原操作标识"})
				return
			}
			if err := submission.CloseMissing(r.Context(), cfg.SQLiteFile(), workspaceOf(r), "canvas-text", key); err != nil {
				httpx.WriteJSON(w, 503, map[string]any{"submissionUnknown": true, "error": "无法确认原请求状态"})
				return
			}
			recoverCanvasText(cfg, w, r)
			return
		}
		guarded.ServeHTTP(w, r)
	})
}

func unsafeCanvasGateway(cfg config.Config, r *http.Request, payload map[string]any) string {
	bodyBase, _ := payload["customBaseUrl"].(string)
	clientBase := strings.TrimSpace(bodyBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if clientBase == "" {
		return ""
	}
	format, _ := payload["apiFormat"].(string)
	allowHTTP, _ := payload["allowInsecureHttp"].(bool)
	if system.AllowCustomBase(cfg) || system.SafeHTTPSGateway(clientBase) {
		return ""
	}
	if format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(clientBase) {
		return ""
	}
	return "当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。"
}

const deepseekOfficialBase = "https://api.deepseek.com"

var canvasHTTP = func() *http.Client { return network.SafeClient() }

func writeCanvasText(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any, _ []byte) {
	model, _ := payload["model"].(string)
	prompt, _ := payload["prompt"].(string)
	base, key, upstream, status, message := canvasCredentials(cfg, r, payload, model)
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message, "submissionRejected": true})
		return
	}
	format, _ := payload["apiFormat"].(string)
	var text string
	var usage map[string]any
	if format == "openai-responses" {
		text, status, message, usage = completeCanvasResponses(r.Context(), base, key, upstream, prompt)
	} else {
		text, status, message, usage = completeCanvasText(r.Context(), base, key, upstream, strings.HasPrefix(model, "deepseek-official:"), prompt)
	}
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	body := map[string]any{"success": true, "text": text, "model": upstream}
	if usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func canvasCredentials(cfg config.Config, r *http.Request, payload map[string]any, model string) (string, string, string, int, string) {
	bodyKey, _ := payload["customApiKey"].(string)
	key := strings.TrimSpace(bodyKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	bodyBase, _ := payload["customBaseUrl"].(string)
	clientBase := strings.TrimSpace(bodyBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		id := strings.TrimPrefix(model, "deepseek-official:")
		if id != "deepseek-flash" && id != "deepseek-v4-pro" {
			return "", "", "", http.StatusBadRequest, "此 DeepSeek 官方模型尚未适配"
		}
		if clientBase != "" && gateway.NormalizeGatewayBaseURL(clientBase) != deepseekOfficialBase {
			return "", "", "", http.StatusBadRequest, "DeepSeek 官方模型只能使用官方接口地址"
		}
		if key == "" {
			return "", "", "", http.StatusBadGateway, "请先配置文本模型的 API Key"
		}
		return deepseekOfficialBase, key, id, 0, ""
	}
	defaults := defaultCanvasBase()
	base := defaults
	if clientBase != "" {
		base = gateway.NormalizeGatewayBaseURL(clientBase)
	}
	upstream := model
	if strings.HasPrefix(model, "openai-responses:") {
		upstream = strings.TrimPrefix(model, "openai-responses:")
	}
	thirdParty := clientBase != "" && gateway.NormalizeGatewayBaseURL(clientBase) != gateway.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	if key == "" {
		return "", "", "", http.StatusBadGateway, "请先配置文本模型的 API Key"
	}
	return base, key, upstream, 0, ""
}

func defaultCanvasBase() string {
	if value := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")); value != "" {
		return value
	}
	return "https://ai.comfly.org"
}

func completeCanvasText(ctx context.Context, base, key, model string, deepseek bool, prompt string) (string, int, string, map[string]any) {
	content := "根据以下要求生成可直接使用的文字。仅返回正文，可以使用 Markdown 排版。\n\n" + prompt
	body := map[string]any{
		"model": model,
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "text", "text": content},
		}}},
		"max_tokens": 4096,
		"stream":     false,
	}
	if deepseek {
		body["thinking"] = map[string]any{"type": "disabled"}
	}
	status, data, err := gateway.CompleteText(ctx, gateway.TextRequest{
		BaseURL: base, APIKey: key, Protocol: gateway.TextProtocolForBase(ctx, model, base), Payload: body,
		Client: canvasHTTP(), Timeout: 120 * time.Second,
	})
	if status != 0 && (status < 200 || status >= 300) {
		return "", http.StatusBadGateway, "文本生成失败（HTTP " + Itoa(status) + "），请检查模型配置后重试", nil
	}
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试", nil
	}
	raw, _ := json.Marshal(data)
	text, usage, message := canvasTextFromChat(raw)
	if message != "" {
		return "", http.StatusBadGateway, message, nil
	}
	return text, 0, "", usage
}

func canvasTextFromChat(raw []byte) (string, map[string]any, string) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return "", nil, "模型没有返回文字"
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", nil, "模型没有返回文字"
	}
	choice, _ := choices[0].(map[string]any)
	if choice["finish_reason"] != "stop" {
		return "", nil, "模型未完整返回正文，请调整要求后重试"
	}
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	text = strings.TrimSpace(text)
	if text == "" {
		return "", nil, "模型没有返回文字"
	}
	return text, gateway.NormalizeUsage(data), ""
}

func completeCanvasResponses(ctx context.Context, base, key, model, prompt string) (string, int, string, map[string]any) {
	content := "根据以下要求生成可直接使用的文字。仅返回正文，可以使用 Markdown 排版。\n\n" + prompt
	body := map[string]any{
		"model":             model,
		"input":             []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_text", "text": content}}}},
		"max_output_tokens": 4096,
		"store":             false,
	}
	encoded, _ := json.Marshal(body)
	requestCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, strings.TrimRight(base, "/")+"/v1/responses", bytes.NewReader(encoded))
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试", nil
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := canvasHTTP().Do(request)
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试", nil
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", http.StatusBadGateway, "文本生成失败（HTTP " + Itoa(response.StatusCode) + "），请检查模型配置后重试", nil
	}
	text, usage, message := canvasTextFromResponses(raw)
	if message != "" {
		return "", http.StatusBadGateway, message, nil
	}
	return text, 0, "", usage
}

func canvasTextFromResponses(raw []byte) (string, map[string]any, string) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return "", nil, "OpenAI 未返回可用正文"
	}
	if data["error"] != nil || data["status"] == "failed" {
		return "", nil, "OpenAI 返回错误响应"
	}
	if data["status"] == "incomplete" {
		return "", nil, "OpenAI 输出不完整，请增加输出 token 上限"
	}
	usage := gateway.NormalizeUsage(data)
	if text, ok := data["output_text"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text), usage, ""
	}
	var builder strings.Builder
	output, _ := data["output"].([]any)
	for _, item := range output {
		entry, _ := item.(map[string]any)
		parts, _ := entry["content"].([]any)
		for _, part := range parts {
			mapped, _ := part.(map[string]any)
			if mapped["type"] == "output_text" {
				if text, ok := mapped["text"].(string); ok {
					builder.WriteString(text)
				}
			}
		}
	}
	text := strings.TrimSpace(builder.String())
	if text == "" {
		return "", nil, "OpenAI 未返回可用正文"
	}
	return text, usage, ""
}

// Every stage claims before its paid call. A lost settlement stays query-only.
func canvasObservationReceipt(cfg config.Config, r *http.Request, payload map[string]any, next http.Handler) (int, map[string]any) {
	raw, _ := json.Marshal(payload)
	request := r.Clone(r.Context())
	request.Body = io.NopCloser(bytes.NewReader(raw))
	capture := &canvasStageBuffer{header: make(http.Header), status: 200}
	submission.GuardWithOptions(cfg.SQLiteFile(), "canvas-text-observation", submission.GuardOptions{MaxBytes: 32 << 20, Timeout: 4 * time.Minute}, next).ServeHTTP(capture, request)
	var body map[string]any
	if json.Unmarshal(capture.body.Bytes(), &body) != nil {
		return 503, map[string]any{"success": false, "submissionUnknown": true, "error": "观察阶段回执未确认，请查询原操作"}
	}
	return capture.status, body
}

type canvasStageBuffer struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *canvasStageBuffer) Header() http.Header             { return w.header }
func (w *canvasStageBuffer) WriteHeader(status int)          { w.status = status }
func (w *canvasStageBuffer) Write(value []byte) (int, error) { return w.body.Write(value) }

// Recovery never invokes a model or depends on the currently selected channel.
func recoverCanvasText(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(r.URL.Query().Get("operationKey"))
	if key == "" || len(key) > 256 {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "submissionUnknown": true, "error": "缺少有效的原操作标识"})
		return
	}
	read := func(kind string) (submission.Receipt, error) {
		return submission.Read(r.Context(), cfg.SQLiteFile(), workspaceOf(r), kind, key)
	}
	root, err := read("canvas-text")
	if err != nil {
		status := 503
		if errors.Is(err, submission.ErrNotFound) {
			status = 404
		}
		httpx.WriteJSON(w, status, map[string]any{"success": false, "submissionUnknown": true, "operationKey": key, "error": "原文本回执暂不可用，请继续查询，不要重新提交"})
		return
	}
	if root.Status != 0 {
		replyCanvasTextReceipt(w, root)
		return
	}
	result, resultErr := read("canvas-text-result")
	if resultErr == nil && result.Status != 0 {
		replyCanvasTextReceipt(w, result)
		return
	}
	body := map[string]any{"success": false, "submissionUnknown": true, "operationKey": key, "stage": "result", "error": "原文本操作正在执行或结果待核对，请查询原回执，不会重新提交"}
	observation, observationErr := read("canvas-text-observation")
	if observationErr == nil && observation.Status != 0 {
		body["stages"] = map[string]any{"observation": observation.Body}
		if observation.Body["success"] == true {
			body["observation"] = observation.Body["observation"]
			body["storyboardEvidence"] = observation.Body["storyboardEvidence"]
		}
	}
	if resultErr != nil && !errors.Is(resultErr, submission.ErrNotFound) || observationErr != nil && !errors.Is(observationErr, submission.ErrNotFound) {
		httpx.WriteJSON(w, 503, body)
		return
	}
	httpx.WriteJSON(w, 409, body)
}

func replyCanvasTextReceipt(w http.ResponseWriter, row submission.Receipt) {
	// Earlier receipts marked explicit authentication and image rejections as
	// unknown. Normalize only confirmed upstream rejections on read.
	detail, _ := row.Body["error"].(string)
	if row.Status == http.StatusBadGateway && (detail == "请先配置文本模型的 API Key" ||
		strings.Contains(detail, "，HTTP 401）：text upstream HTTP 401:") ||
		(row.Body["stage"] == "result" && row.Body["storyboardEvidence"] != nil && canvasStoryboardImageRejected(detail))) {
		row.Body["submissionRejected"] = true
		row.Body["submissionUnknown"] = false
	}
	submission.Reply(w, row)
}

// These are explicit input rejections, not transport or settlement failures.
func canvasStoryboardImageRejected(detail string) bool {
	return strings.Contains(detail, "text upstream HTTP 400: You uploaded an unsupported image.") ||
		strings.Contains(detail, "text upstream HTTP 400: Your input image may contain content that is not allowed by our content safety system.")
}

// RequestTextProtocol validates the request override. An explicitly supplied body
// field (including auto or empty) wins over the header.
func RequestTextProtocol(r *http.Request, payload map[string]any) (string, error) {
	value := strings.TrimSpace(r.Header.Get("x-text-protocol"))
	raw, exists := payload["textProtocol"]
	if !exists {
		// Background deconstruction submissions retain model options in overrides.
		if overrides, ok := payload["overrides"].(map[string]any); ok {
			raw, exists = overrides["textProtocol"]
		}
	}
	if exists {
		text, ok := raw.(string)
		if !ok {
			return "", fmt.Errorf("textProtocol 必须为字符串")
		}
		value = strings.TrimSpace(text)
	}
	value = strings.ToLower(value)
	switch value {
	case "", "auto", "openai", "gemini", "anthropic":
		return value, nil
	default:
		return "", fmt.Errorf("无效的 textProtocol，支持 auto、openai、gemini、anthropic")
	}
}

// BindTextProtocol keeps protocol selection scoped to this model request.
func BindTextProtocol(w http.ResponseWriter, r *http.Request, payload map[string]any) (*http.Request, bool) {
	protocol, err := RequestTextProtocol(r, payload)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
		return r, false
	}
	return r.WithContext(gateway.WithTextProtocol(r.Context(), protocol)), true
}

// TextFallbackAllowed prevents a native provider failure from being disguised as
// a successful local placeholder. Existing compatible-provider fallback policy remains.
func TextFallbackAllowed(ctx context.Context, model string) bool {
	return gateway.TextProtocol(ctx, model) == "openai"
}

func bindRawTextProtocol(w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) (*http.Request, bool) {
	fields := map[string]any{}
	if raw, exists := payload["textProtocol"]; exists {
		var value any
		_ = json.Unmarshal(raw, &value)
		fields["textProtocol"] = value
	}
	return BindTextProtocol(w, r, fields)
}
