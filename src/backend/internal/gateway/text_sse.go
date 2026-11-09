package gateway

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

const textSSEEventLimit = 4 << 20

type textSSEHandler func(event string, data []byte) (bool, error)

// readTextSSE implements SSE data-line folding, comments, CRLF, explicit errors,
// and bounded line/event/total sizes. It never treats EOF as a completion marker.
func readTextSSE(r io.Reader, handler textSSEHandler) error {
	scanner := bufio.NewScanner(io.LimitReader(r, textBodyLimit+1))
	scanner.Buffer(make([]byte, 4096), textSSEEventLimit)
	var data strings.Builder
	event := ""
	total := 0
	for scanner.Scan() {
		line := scanner.Text()
		total += len(line) + 1
		if total > textBodyLimit {
			return errors.New("text SSE exceeds total size limit")
		}
		if line == "" {
			if data.Len() > 0 {
				payload := strings.TrimSuffix(data.String(), "\n")
				done, err := handler(event, []byte(payload))
				if err != nil {
					return err
				}
				if done {
					return nil
				}
			}
			data.Reset()
			event = ""
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, _ := strings.Cut(line, ":")
		value = strings.TrimPrefix(value, " ")
		switch field {
		case "event":
			event = value
		case "data":
			if data.Len()+len(value)+1 > textSSEEventLimit {
				return errors.New("text SSE event exceeds size limit")
			}
			data.WriteString(value)
			data.WriteByte('\n')
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("text SSE read failed: %w", err)
	}
	if data.Len() > 0 {
		return errors.New("text SSE ended inside an event")
	}
	return nil
}

func readTextStream(r io.Reader, protocol, model string, onDelta func(string, string)) (map[string]any, error) {
	emit := func(kind, text string) {
		if onDelta != nil && text != "" {
			onDelta(kind, text)
		}
	}
	switch protocol {
	case "gemini":
		return readGeminiStream(r, model, emit)
	case "anthropic":
		return readAnthropicStream(r, model, emit)
	default:
		return readOpenAIStream(r, model, emit)
	}
}

func textSSEJSON(event string, raw []byte) (map[string]any, error) {
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil || data == nil {
		return nil, errors.New("invalid text SSE JSON")
	}
	if event == "error" || data["error"] != nil || data["type"] == "error" {
		return data, errors.New("text upstream SSE error")
	}
	return data, nil
}

func readGeminiStream(r io.Reader, model string, emit func(string, string)) (map[string]any, error) {
	merged := map[string]any{}
	candidate := map[string]any{}
	parts := []any{}
	finished := false
	err := readTextSSE(r, func(event string, raw []byte) (bool, error) {
		data, err := textSSEJSON(event, raw)
		for _, key := range []string{"usageMetadata", "responseId", "modelVersion", "promptFeedback"} {
			if v, ok := data[key]; ok {
				merged[key] = v
			}
		}
		if err != nil {
			return false, err
		}
		for _, rawCandidate := range textArray(data["candidates"]) {
			c := textMap(rawCandidate)
			if index, ok := c["index"]; ok && textNumber(index) != 0 {
				continue
			}
			incoming := textArray(textMap(c["content"])["parts"])
			if finished && len(incoming) > 0 {
				return false, errors.New("Gemini content after finish marker")
			}
			for _, rawPart := range incoming {
				part := textMap(rawPart)
				if s := textString(part["text"]); s != "" {
					kind := "content"
					if part["thought"] == true {
						kind = "reasoning"
					}
					emit(kind, s)
				}
				parts = mergeGeminiStreamPart(parts, part)
			}
			if finish := textString(c["finishReason"]); finish != "" {
				candidate["finishReason"] = finish
				finished = true
			}
		}
		return false, nil
	})
	if err != nil {
		return streamFailureReceipt("gemini", model, merged), err
	}
	if !finished {
		return streamFailureReceipt("gemini", model, merged), errors.New("Gemini stream ended before finish marker")
	}
	candidate["content"] = map[string]any{"role": "model", "parts": parts}
	merged["candidates"] = []any{candidate}
	response, err := geminiResponse(merged, model)
	if err != nil {
		return streamFailureReceipt("gemini", model, merged), err
	}
	return response, nil
}

func mergeGeminiStreamPart(parts []any, part map[string]any) []any {
	if len(parts) > 0 {
		last := textMap(parts[len(parts)-1])
		_, hasText := part["text"]
		_, lastText := last["text"]
		signatureOnly := part["thoughtSignature"] != nil && !hasText && part["functionCall"] == nil
		if (hasText && lastText && (last["thought"] == true) == (part["thought"] == true) && last["thoughtSignature"] == nil) || (signatureOnly && last["thoughtSignature"] == nil) {
			for key, value := range part {
				if key == "text" {
					last[key] = textString(last[key]) + textString(value)
				} else {
					last[key] = value
				}
			}
			return parts
		}
	}
	return append(parts, part)
}

func readOpenAIStream(r io.Reader, model string, emit func(string, string)) (map[string]any, error) {
	result := map[string]any{"object": "chat.completion", "model": model}
	msg := map[string]any{"role": "assistant", "content": ""}
	tools := map[int]map[string]any{}
	finish := ""
	done := false
	err := readTextSSE(r, func(event string, raw []byte) (bool, error) {
		if bytes.Equal(bytes.TrimSpace(raw), []byte("[DONE]")) {
			done = true
			return true, nil
		}
		data, err := textSSEJSON(event, raw)
		for _, key := range []string{"id", "model", "created", "system_fingerprint", "usage"} {
			if value, ok := data[key]; ok {
				result[key] = value
			}
		}
		if err != nil {
			return false, err
		}
		for _, rawChoice := range textArray(data["choices"]) {
			choice := textMap(rawChoice)
			if index, ok := choice["index"]; ok && textNumber(index) != 0 {
				continue
			}
			delta := textMap(choice["delta"])
			if finish != "" && len(delta) > 0 {
				return false, errors.New("OpenAI content after finish reason")
			}
			for _, key := range []string{"content", "reasoning_content", "reasoning"} {
				if s := textString(delta[key]); s != "" {
					target, kind := key, "content"
					if key != "content" {
						target = "reasoning_content"
						kind = "reasoning"
					}
					msg[target] = textString(msg[target]) + s
					emit(kind, s)
				}
			}
			if v, ok := delta["refusal"]; ok {
				msg["refusal"] = textString(msg["refusal"]) + textString(v)
			}
			for _, rawCall := range textArray(delta["tool_calls"]) {
				call := textMap(rawCall)
				index := int(textNumber(call["index"]))
				if index < 0 || index > 4096 {
					return false, errors.New("invalid OpenAI tool index")
				}
				accumulated := tools[index]
				if accumulated == nil {
					accumulated = map[string]any{"type": "function", "function": map[string]any{"name": "", "arguments": ""}}
					tools[index] = accumulated
				}
				if id := textString(call["id"]); id != "" {
					prior := textString(accumulated["id"])
					if prior != "" && prior != id {
						return false, errors.New("OpenAI tool id changed within a call")
					}
					accumulated["id"] = id
				}
				if kind := textString(call["type"]); kind != "" && kind != "function" {
					return false, errors.New("unsupported OpenAI streamed tool type")
				}
				incoming := textMap(call["function"])
				fn := textMap(accumulated["function"])
				for _, key := range []string{"name", "arguments"} {
					fn[key] = textString(fn[key]) + textString(incoming[key])
				}
				if extra := textMap(call["extra_content"]); extra != nil {
					merged := textMap(accumulated["extra_content"])
					if merged == nil {
						merged = map[string]any{}
					}
					mergeTextMetadata(merged, extra)
					accumulated["extra_content"] = merged
				}
			}
			if value := textString(choice["finish_reason"]); value != "" {
				finish = value
			}
		}
		return false, nil
	})
	if err != nil {
		return streamFailureReceipt("openai", model, result), err
	}
	if !done || finish == "" {
		return streamFailureReceipt("openai", model, result), errors.New("OpenAI stream ended without completion markers")
	}
	if len(tools) > 0 {
		indexes := make([]int, 0, len(tools))
		for index := range tools {
			indexes = append(indexes, index)
		}
		sort.Ints(indexes)
		calls := []any{}
		for _, index := range indexes {
			calls = append(calls, tools[index])
		}
		msg["tool_calls"] = calls
	}
	result["choices"] = []any{map[string]any{"index": 0, "message": msg, "finish_reason": finish}}
	if err := validateOpenAIText(result); err != nil {
		return streamFailureReceipt("openai", model, result), err
	}
	return result, nil
}

func mergeTextMetadata(destination, source map[string]any) {
	for key, value := range source {
		incoming := textMap(value)
		existing := textMap(destination[key])
		if incoming != nil && existing != nil {
			mergeTextMetadata(existing, incoming)
		} else {
			destination[key] = value
		}
	}
}

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
	model := textString(payload["model"])
	messages, _ := payload["messages"].([]any)
	input := []any{}
	for _, raw := range messages {
		message := textMap(raw)
		content, err := textContentParts(message)
		if err != nil {
			return 0, nil, err
		}
		parts := []any{}
		for _, raw := range content {
			part := textMap(raw)
			switch part["type"] {
			case "text":
				parts = append(parts, map[string]any{"type": "input_text", "text": part["text"]})
			case "image_url":
				parts = append(parts, map[string]any{"type": "input_image", "image_url": textMap(part["image_url"])["url"]})
			default:
				return 0, nil, errors.New("unsupported Responses message content part")
			}
		}
		input = append(input, map[string]any{"role": message["role"], "content": parts})
	}
	wire := map[string]any{"model": strings.TrimPrefix(textString(payload["model"]), "openai-responses:"), "input": input, "store": false, "max_output_tokens": 16000}
	if effort, _ := payload["reasoning_effort"].(string); effort == "low" || effort == "medium" || effort == "high" {
		wire["reasoning"] = map[string]any{"effort": effort}
	}
	if enabled, _ := payload["canvasWebSearch"].(bool); enabled {
		wire["tools"] = []any{map[string]any{"type": "web_search"}}
	}
	body, err := json.Marshal(wire)
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
		return response.StatusCode, textFailureUsageReceipt("openai", model, data), errors.New("responses text output not completed")
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
		return response.StatusCode, textFailureUsageReceipt("openai", model, data), errors.New("responses text output empty")
	}
	data["choices"] = []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": strings.TrimSpace(text)}}}
	return response.StatusCode, data, nil
}

// An incomplete stream is never a completion. Retain only observed identity and
// accounting fields so callers can reconcile cost without accepting partial text.
func streamFailureReceipt(protocol, model string, data map[string]any) map[string]any {
	receipt := map[string]any{"submissionUnknown": true, "model": model}
	for _, field := range []string{"id", "model", "created", "system_fingerprint", "requestId"} {
		if value, ok := data[field]; ok {
			receipt[field] = value
		}
	}
	var usage map[string]any
	switch protocol {
	case "anthropic":
		if native := textMap(data["usage"]); len(native) > 0 {
			usage = anthropicUsage(native)
		}
	case "gemini":
		if native := textMap(data["usageMetadata"]); len(native) > 0 {
			usage = geminiUsage(native)
		}
		if id := data["responseId"]; id != nil {
			receipt["id"] = id
		}
	default:
		usage = textMap(data["usage"])
	}
	if len(usage) > 0 {
		receipt["usage"] = usage
	}
	return receipt
}

// Invalid output is unusable, but already reported billing evidence remains valid.
func textFailureUsageReceipt(protocol, model string, data map[string]any) map[string]any {
	receipt := streamFailureReceipt(protocol, model, data)
	if NormalizeUsage(receipt) == nil {
		return nil
	}
	return receipt
}
