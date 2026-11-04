package sales

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

type summaryImage struct {
	Index int    `json:"index"`
	URL   string `json:"url"`
	Text  string `json:"text,omitempty"`
}

type summaryTextSource struct {
	Index int    `json:"index"`
	Text  string `json:"text"`
}

type summaryInput struct {
	ProductFacts string              `json:"productFacts,omitempty"`
	TextSources  []summaryTextSource `json:"textSources"`
	// Legacy requests may still contain these fields; only OCR index/text is used.
	ProductName     string         `json:"productName,omitempty"`
	Brand           string         `json:"brand,omitempty"`
	Facts           string         `json:"facts,omitempty"`
	ReferenceImages []summaryImage `json:"referenceImages,omitempty"`
	TextImages      []summaryImage `json:"textImages,omitempty"`
}

func summaryOCRTextSources(input summaryInput) []summaryTextSource {
	if input.TextSources != nil {
		return input.TextSources
	}
	sources := make([]summaryTextSource, len(input.TextImages))
	for i, image := range input.TextImages {
		sources[i] = summaryTextSource{Index: image.Index, Text: image.Text}
	}
	return sources
}

type summaryRequest struct {
	summaryInput
	Model             string `json:"model"`
	CustomBaseURL     string `json:"customBaseUrl"`
	CustomAPIKey      string `json:"customApiKey"`
	TextProtocol      string `json:"textProtocol"`
	APIFormat         string `json:"apiFormat"`
	AllowInsecureHTTP bool   `json:"allowInsecureHttp"`
}

type summaryCompleter func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error)
type summaryImageReader func(context.Context, string, string) ([]byte, error)

const summaryTextOnlyBoundary = `

## 本次应用输入边界
本次仅有 confirmedTextSources 中当前 OCR 文字及其手动修订；绝无图片、图片地址、商品名称、品牌、采集属性或补充商品文字。仅依据提供的文字提炼，不看图、不访问地址、不搜索或补齐资料，不要求原图核对。文字不足时列出具体疑点。来源只能使用当前提供的 ocr-N，禁止使用 image-N 或 product-meta。此输入边界适用于当前请求，上文涉及图片或其他资料的通用说明在本次没有对应输入。`

func Summary(cfg config.Config) http.HandlerFunc {
	return summaryHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if responses {
			return gateway.CompleteResponses(ctx, req)
		}
		return gateway.CompleteText(ctx, req)
	}, nil)
}

func summaryHandler(cfg config.Config, complete summaryCompleter, read summaryImageReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body summaryRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
		if decoder.Decode(&body) != nil {
			fail(400, "商品整理请求格式错误或资料过长")
			return
		}
		if decoder.Decode(new(any)) != io.EOF {
			fail(400, "请求体必须是单个 JSON 对象")
			return
		}
		body.summaryInput = summaryInput{TextSources: summaryOCRTextSources(body.summaryInput)}
		if message := validateSummaryInput(body); message != "" {
			fail(400, message)
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, map[string]any{"textProtocol": body.TextProtocol})
		if !ok {
			return
		}
		base, key, model, credentialErr := summaryCredentials(cfg, r, body)
		if credentialErr != "" {
			fail(400, credentialErr)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 180*time.Second)
		defer cancel()
		prompt, promptErr := loadSalesPrompt(ctx, cfg, httpx.WorkspaceFrom(r), "summary")
		if promptErr != nil {
			promptStorageFailure(w, promptErr)
			return
		}
		content, err := summaryContent(ctx, body.summaryInput, httpx.WorkspaceFrom(r), read)
		if err != nil {
			fail(504, "卖点提炼已取消或超时，请稍后重试")
			return
		}
		boundary := summaryTextOnlyBoundary
		if body.ProductFacts != "" {
			boundary = "\n\n本次提供 product-meta 商品文字和 confirmedTextSources 内实际存在的 ocr-N。两者分别保留来源；发生冲突写入 conflicts，未经核实的说法不得用于成稿。未附图片或原视频，不补造任何视觉或实测结论。"
		}
		payload := map[string]any{"model": model, "max_tokens": 5000, "response_format": map[string]any{"type": "json_object"},
			"messages": []any{map[string]any{"role": "system", "content": []any{map[string]any{"type": "text", "text": prompt.Prompt + boundary}}}, map[string]any{"role": "user", "content": content}}}
		protocol := gateway.TextProtocolForBase(ctx, model, base)
		host := ""
		if endpoint, parseErr := url.Parse(base); parseErr == nil {
			host = endpoint.Hostname()
		}
		requestID := httpx.RequestID()
		log.Printf("[sales-summary] request=%s stage=model model=%q protocol=%q host=%q text_sources=%d skill=%s", requestID, model, protocol, host, len(body.TextSources), prompt.Version)
		status, data, err := complete(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol,
			Payload: payload, Client: gateway.ModelHTTP(), Timeout: 180 * time.Second}, body.APIFormat == "openai-responses")
		if err != nil || status < 200 || status >= 300 {
			failure := classifySummaryFailure(ctx, status, err, key)
			log.Printf("[sales-summary] request=%s stage=%s code=%s upstream_status=%d detail=%q", requestID, failure.Stage, failure.Code, status, failure.Detail)
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": failure.Stage, "upstreamStatus": status, "requestId": requestID})
			return
		}
		result, err := parseSummaryCompletion(data, body.summaryInput)
		if err != nil {
			log.Printf("[sales-summary] request=%s stage=validation upstream_status=%d detail=%q", requestID, status, err.Error())
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "模型整理未通过检查：" + err.Error() + "；未保存本次文案，原始资料已保留", "code": "summary_validation", "stage": "validation", "requestId": requestID})
			return
		}
		log.Printf("[sales-summary] request=%s stage=complete points=%d", requestID, len(result.Points))
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "result": result, "model": model, "skillVersion": prompt.Version})
	}
}

func summaryContent(ctx context.Context, input summaryInput, _ string, _ summaryImageReader) ([]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	textSources := []any{}
	for _, source := range summaryOCRTextSources(input) {
		textSources = append(textSources, map[string]any{"id": fmt.Sprintf("ocr-%d", source.Index+1), "text": source.Text})
	}
	materials := map[string]any{"confirmedTextSources": textSources}
	if input.ProductFacts != "" {
		materials["productFacts"] = map[string]any{"id": "product-meta", "text": input.ProductFacts}
	}
	data, _ := json.Marshal(materials)
	return []any{map[string]any{"type": "text", "text": string(data)}}, nil
}
