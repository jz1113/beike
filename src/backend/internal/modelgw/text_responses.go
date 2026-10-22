package modelgw

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// CompleteResponses uses canonical OpenAI multimodal messages and returns the same
// choices shape as CompleteText. Provider selection remains explicit, without replay.
func CompleteResponses(ctx context.Context, req TextRequest) (int, map[string]any, error) {
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	payload, err := textClone(req.Payload)
	if err != nil {
		return 0, nil, err
	}
	if err := prepareOpenAITextImages(ctx, payload); err != nil {
		return 0, nil, err
	}
	messages, _ := payload["messages"].([]any)
	input := []any{}
	for _, raw := range messages {
		message := textMap(raw)
		content, _ := message["content"].([]any)
		parts := []any{}
		for _, raw := range content {
			part := textMap(raw)
			switch part["type"] {
			case "text":
				parts = append(parts, map[string]any{"type": "input_text", "text": part["text"]})
			case "image_url":
				parts = append(parts, map[string]any{"type": "input_image", "image_url": textMap(part["image_url"])["url"]})
			}
		}
		input = append(input, map[string]any{"role": message["role"], "content": parts})
	}
	body, err := json.Marshal(map[string]any{"model": strings.TrimPrefix(textString(payload["model"]), "openai-responses:"), "input": input, "store": false, "max_output_tokens": 16000})
	if err != nil {
		return 0, nil, err
	}
	if len(body) > textBodyLimit {
		return 0, nil, errors.New("text upstream request exceeds size limit")
	}
	base := strings.TrimRight(req.BaseURL, "/")
	if !strings.HasSuffix(base, "/v1") {
		base += "/v1"
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/responses", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+req.APIKey)
	response, err := textHTTPClient(req.Client).Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, textBodyLimit+1))
	if err != nil || len(raw) > textBodyLimit {
		return response.StatusCode, nil, errors.New("responses text body incomplete or too large")
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil || data["error"] != nil || data["status"] != "completed" {
		return response.StatusCode, nil, errors.New("responses text output not completed")
	}
	text := textString(data["output_text"])
	if text == "" {
		output, _ := data["output"].([]any)
		for _, raw := range output {
			item := textMap(raw)
			items, _ := item["content"].([]any)
			for _, raw := range items {
				part := textMap(raw)
				if part["type"] == "output_text" {
					text += textString(part["text"])
				}
			}
		}
	}
	if strings.TrimSpace(text) == "" {
		return response.StatusCode, nil, errors.New("responses text output empty")
	}
	data["choices"] = []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": strings.TrimSpace(text)}}}
	return response.StatusCode, data, nil
}
