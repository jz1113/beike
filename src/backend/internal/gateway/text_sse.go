package gateway

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
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
		return nil, errors.New("text upstream SSE error")
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
		if err != nil {
			return false, err
		}
		for _, key := range []string{"usageMetadata", "responseId", "modelVersion", "promptFeedback"} {
			if v, ok := data[key]; ok {
				merged[key] = v
			}
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
		return nil, err
	}
	if !finished {
		return nil, errors.New("Gemini stream ended before finish marker")
	}
	candidate["content"] = map[string]any{"role": "model", "parts": parts}
	merged["candidates"] = []any{candidate}
	return geminiResponse(merged, model)
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
