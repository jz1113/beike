package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
)

type geminiImageProtocol struct{}

func (geminiImageProtocol) ID() string { return "gemini" }

func (geminiImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	if strings.Contains(strings.ToLower(req.Model), "2.5-flash-image") && len(req.Refs) > 3 {
		return imageSubmitResult{}, imageEditPrepareError{"gemini-2.5-flash-image 最多支持 3 张参考图。"}
	}
	if len(req.Refs) > geminiMaxReferenceImages {
		return imageSubmitResult{}, imageEditPrepareError{"Gemini / Nano Banana 模型最多支持 14 张参考图。"}
	}
	ratio := resolveGeminiAspectRatio(req.Model, req.Size, req.AspectRatio)
	imageSize := resolveGeminiImageSize(req.Model, req.Size, req.Quality, req.ImageQuality)
	pixelSize := geminiOfficialPixelSize(req.Model, ratio, imageSize)
	parts := make([]any, 0, len(req.Refs)+1)
	for index, ref := range req.Refs {
		file, err := loadEditImage(req.context(), ref, index, req.Workspace, req.Production)
		if err != nil {
			return imageSubmitResult{}, err
		}
		parts = append(parts, map[string]any{
			"inlineData": map[string]any{
				"mimeType": file.mime,
				"data":     base64.StdEncoding.EncodeToString(file.data),
			},
		})
	}
	parts = append(parts, map[string]any{"text": req.Prompt})
	imageConfig := map[string]any{}
	if ratio != "" {
		imageConfig["aspectRatio"] = ratio
	}
	if imageSize != "" {
		imageConfig["imageSize"] = imageSize
	}
	genConfig := map[string]any{
		"responseModalities": []string{"IMAGE"},
	}
	if len(imageConfig) > 0 {
		genConfig["imageConfig"] = imageConfig
	}
	if level := resolveGeminiImageThinkingLevel(req.Model, req.Strength); level != "" {
		genConfig["thinkingConfig"] = map[string]any{"thinkingLevel": level}
	}
	body := map[string]any{
		"contents": []any{
			map[string]any{"role": "user", "parts": parts},
		},
		"generationConfig": genConfig,
	}
	adapted := imageAdapted{
		family:   "gemini-nano",
		modelID:  req.Model,
		prompt:   req.Prompt,
		size:     pixelSize,
		endpoint: "generateContent",
		payload:  body,
	}
	endpoint := geminiImageEndpoint(req.Base, req.Model)
	status, raw, err := postGeminiGenerateContent(req.context(), endpoint, req.APIKey, body, 120*time.Second)
	if err != nil {
		return imageSubmitResult{}, err
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	taskID, direct := imageOutcome(data)
	if direct == "" {
		direct = geminiImageDirect(data)
	}
	if taskID == "" && direct == "" {
		if reason := geminiFinishFailure(data); reason != "" {
			data["message"] = reason
			if status >= 200 && status < 300 {
				status = http.StatusBadRequest
			}
		}
	}
	return imageSubmitResult{Status: status, Data: data, TaskID: taskID, Direct: direct, Adapted: adapted}, nil
}

func (geminiImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	return openaiImageProtocol{}.Poll(req)
}

func isGeminiOfficialGateway(base string) bool {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil || parsed.Host == "" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "generativelanguage.googleapis.com" || strings.HasSuffix(host, ".googleapis.com")
}

func geminiImageEndpoint(base, model string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return trimmed + "/v1beta/models/" + strings.TrimSpace(model) + ":generateContent"
	}
	path := strings.TrimRight(parsed.Path, "/")
	if idx := strings.Index(path, "/models/"); idx >= 0 {
		path = path[:idx]
	}
	path = strings.TrimSuffix(path, "/v1")
	if !strings.HasSuffix(path, "/v1beta") {
		path += "/v1beta"
	}
	parsed.Path = path + "/models/" + strings.TrimSpace(model) + ":generateContent"
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func postGeminiGenerateContent(ctx context.Context, endpoint, apiKey string, payload any, timeout time.Duration) (int, []byte, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, err
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		request.Header.Set("x-goog-api-key", apiKey)
		if !isGeminiOfficialGateway(endpoint) {
			request.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	return response.StatusCode, raw, err
}

// geminiImageDirect extracts the final non-thought image from Gemini generateContent or Interactions responses.
func geminiImageDirect(data map[string]any) string {
	if data == nil {
		return ""
	}
	if candidates, ok := data["candidates"].([]any); ok {
		var last string
		for _, item := range candidates {
			cand, _ := item.(map[string]any)
			content, _ := cand["content"].(map[string]any)
			parts, _ := content["parts"].([]any)
			for _, rawPart := range parts {
				part, _ := rawPart.(map[string]any)
				if part == nil || part["thought"] == true {
					continue
				}
				if url := extractGeminiInlineImage(part["inlineData"]); url != "" {
					last = url
				} else if url := extractGeminiInlineImage(part["inline_data"]); url != "" {
					last = url
				}
			}
		}
		if last != "" {
			return last
		}
	}
	for _, key := range []string{"output_image", "outputImage"} {
		if url := extractGeminiInlineImage(data[key]); url != "" {
			return url
		}
	}
	if outputs, ok := data["outputs"].([]any); ok {
		var last string
		for _, item := range outputs {
			node, _ := item.(map[string]any)
			if node == nil || node["thought"] == true {
				continue
			}
			if url := extractGeminiInlineImage(node["image"]); url != "" {
				last = url
			} else if url := extractGeminiInlineImage(node); url != "" {
				last = url
			}
		}
		if last != "" {
			return last
		}
	}
	return ""
}

func extractGeminiInlineImage(raw any) string {
	node, _ := raw.(map[string]any)
	if node == nil {
		return ""
	}
	b64, _ := node["data"].(string)
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(b64), "data:image/") || strings.HasPrefix(b64, "https://") || strings.HasPrefix(b64, "http://") {
		return b64
	}
	mimeType, _ := node["mimeType"].(string)
	if mimeType == "" {
		mimeType, _ = node["mime_type"].(string)
	}
	mimeType = strings.TrimSpace(mimeType)
	if strings.HasPrefix(strings.ToLower(mimeType), "image/") {
		return "data:" + mimeType + ";base64," + b64
	}
	return gateway.DataImageURL(b64)
}

func geminiFinishFailure(data map[string]any) string {
	candidates, _ := data["candidates"].([]any)
	for _, item := range candidates {
		cand, _ := item.(map[string]any)
		finish, _ := cand["finishReason"].(string)
		finish = strings.TrimSpace(finish)
		if finish != "" && !strings.EqualFold(finish, "STOP") {
			return "Gemini 生图未完成 (" + finish + ")，可能触发安全策略限制，请调整提示词后重试"
		}
	}
	return ""
}
