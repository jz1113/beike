package modelgw

import (
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strings"
)

type anthropicStreamBlock struct {
	content map[string]any
	input   strings.Builder
	closed  bool
}

func readAnthropicStream(r io.Reader, model string, emit func(string, string)) (map[string]any, error) {
	result := map[string]any{}
	blocks := map[int]*anthropicStreamBlock{}
	started, stopped, hasFinish := false, false, false
	err := readTextSSE(r, func(event string, raw []byte) (bool, error) {
		data, err := textSSEJSON(event, raw)
		if err != nil {
			return false, err
		}
		kind := textString(data["type"])
		if event != "" && event != kind {
			return false, errors.New("Claude SSE event/type mismatch")
		}
		switch kind {
		case "ping":
			return false, nil
		case "message_start":
			if started {
				return false, errors.New("duplicate Claude message start")
			}
			message := textMap(data["message"])
			if message == nil {
				return false, errors.New("missing Claude stream message")
			}
			started = true
			for key, value := range message {
				result[key] = value
			}
		case "content_block_start":
			if !started || hasFinish {
				return false, errors.New("unexpected Claude content start")
			}
			index := int(textNumber(data["index"]))
			if index < 0 || index > 4096 || blocks[index] != nil {
				return false, errors.New("invalid Claude block index")
			}
			block := textMap(data["content_block"])
			if block == nil {
				return false, errors.New("missing Claude content block")
			}
			blocks[index] = &anthropicStreamBlock{content: block}
			if block["type"] == "text" && textString(block["text"]) != "" {
				emit("content", textString(block["text"]))
			}
			if block["type"] == "thinking" && textString(block["thinking"]) != "" {
				emit("reasoning", textString(block["thinking"]))
			}
		case "content_block_delta":
			block := blocks[int(textNumber(data["index"]))]
			if block == nil || block.closed {
				return false, errors.New("Claude delta outside an open block")
			}
			delta := textMap(data["delta"])
			switch textString(delta["type"]) {
			case "text_delta":
				if block.content["type"] != "text" {
					return false, errors.New("Claude text delta in non-text block")
				}
				text := textString(delta["text"])
				block.content["text"] = textString(block.content["text"]) + text
				emit("content", text)
			case "thinking_delta":
				if block.content["type"] != "thinking" {
					return false, errors.New("Claude thinking delta in wrong block")
				}
				text := textString(delta["thinking"])
				block.content["thinking"] = textString(block.content["thinking"]) + text
				emit("reasoning", text)
			case "signature_delta":
				if block.content["type"] != "thinking" {
					return false, errors.New("Claude signature delta in wrong block")
				}
				block.content["signature"] = textString(block.content["signature"]) + textString(delta["signature"])
			case "input_json_delta":
				if block.content["type"] != "tool_use" {
					return false, errors.New("Claude tool delta in wrong block")
				}
				block.input.WriteString(textString(delta["partial_json"]))
			case "citations_delta":
				block.content["citations"] = append(textArray(block.content["citations"]), delta["citation"])
			default:
				return false, errors.New("unsupported Claude content delta")
			}
		case "content_block_stop":
			block := blocks[int(textNumber(data["index"]))]
			if block == nil || block.closed {
				return false, errors.New("Claude stopped unknown or closed block")
			}
			if block.input.Len() > 0 {
				var args map[string]any
				if json.Unmarshal([]byte(block.input.String()), &args) != nil || args == nil {
					return false, errors.New("Claude streamed incomplete tool JSON")
				}
				block.content["input"] = args
			}
			block.closed = true
		case "message_delta":
			if !started {
				return false, errors.New("Claude message delta before start")
			}
			delta := textMap(data["delta"])
			for key, value := range delta {
				result[key] = value
			}
			if textString(delta["stop_reason"]) != "" {
				hasFinish = true
			}
			if incoming := textMap(data["usage"]); incoming != nil {
				usage := textMap(result["usage"])
				if usage == nil {
					usage = map[string]any{}
				}
				for key, value := range incoming {
					usage[key] = value
				}
				result["usage"] = usage
			}
		case "message_stop":
			if !started || !hasFinish {
				return false, errors.New("Claude stream stopped without finish reason")
			}
			for _, block := range blocks {
				if !block.closed {
					return false, errors.New("Claude stream stopped with unclosed block")
				}
			}
			stopped = true
			return true, nil
		default:
			return false, errors.New("unsupported Claude stream event")
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	if !stopped {
		return nil, errors.New("Claude stream ended before message_stop")
	}
	indexes := make([]int, 0, len(blocks))
	for index := range blocks {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	content := []any{}
	for _, index := range indexes {
		content = append(content, blocks[index].content)
	}
	result["content"] = content
	return anthropicResponse(result, model)
}
