package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
)

func anthropicRequest(ctx context.Context, p map[string]any, model string, stream bool) (map[string]any, error) {
	out := map[string]any{"model": model, "max_tokens": 4096, "stream": stream}
	for _, key := range []string{"max_tokens", "temperature", "top_p", "top_k"} {
		if v, ok := p[key]; ok {
			out[key] = v
		}
	}
	if v, ok := p["max_completion_tokens"]; ok {
		out["max_tokens"] = v
	}
	if stop, ok := p["stop"]; ok {
		if s, ok := stop.(string); ok {
			stop = []any{s}
		}
		out["stop_sequences"] = stop
	}
	messages := []any{}
	system := []any{}
	calls := map[string]bool{}
	for _, raw := range textArray(p["messages"]) {
		msg := textMap(raw)
		role := textString(msg["role"])
		if role == "tool" {
			id := textString(msg["tool_call_id"])
			if !calls[id] {
				return nil, errors.New("Claude tool result has no matching call")
			}
			parts, err := anthropicParts(ctx, msg)
			if err != nil {
				return nil, err
			}
			block := map[string]any{"type": "tool_result", "tool_use_id": id, "content": parts}
			if msg["is_error"] == true {
				block["is_error"] = true
			}
			appendAnthropicContent(&messages, "user", []any{block})
			continue
		}
		if role != "user" && role != "assistant" && role != "system" && role != "developer" {
			return nil, fmt.Errorf("unsupported Claude message role %q", role)
		}
		parts, err := anthropicParts(ctx, msg)
		if err != nil {
			return nil, err
		}
		if role == "system" || role == "developer" {
			for _, raw := range parts {
				if textMap(raw)["type"] != "text" {
					return nil, errors.New("Claude system instruction must be text")
				}
			}
			system = append(system, parts...)
			continue
		}
		if role == "assistant" {
			toolCalls, err := textToolCalls(msg)
			if err != nil {
				return nil, err
			}
			for _, raw := range toolCalls {
				calls[textString(textMap(raw)["id"])] = true
			}
			native, ok, err := textNative(msg, "anthropic", model)
			if err != nil {
				return nil, err
			}
			if ok {
				parts = native
			} else {
				for _, raw := range toolCalls {
					call := textMap(raw)
					fn := textMap(call["function"])
					args, _ := textArguments(fn["arguments"])
					parts = append(parts, map[string]any{"type": "tool_use", "id": call["id"], "name": fn["name"], "input": args})
				}
			}
		}
		if len(parts) > 0 {
			appendAnthropicContent(&messages, role, parts)
		}
	}
	if len(messages) == 0 {
		return nil, errors.New("Claude requires conversation content")
	}
	out["messages"] = messages
	format := textMap(p["response_format"])
	switch textString(format["type"]) {
	case "json_schema":
		schema := textMap(format["json_schema"])["schema"]
		if textMap(schema) == nil {
			return nil, errors.New("missing Claude JSON schema")
		}
		out["output_config"] = map[string]any{"format": map[string]any{"type": "json_schema", "schema": schema}}
	case "json_object":
		// Claude has no unrestricted JSON-object constrained-decoding mode. Keep
		// the caller's schema semantics instead of inventing an empty strict schema.
		system = append(system, map[string]any{"type": "text", "text": "Return only a valid JSON object, without markdown or additional text."})
	case "", "text":
	default:
		return nil, errors.New("unsupported Claude response format")
	}
	if len(system) > 0 {
		out["system"] = system
	}
	tools, err := textToolDefinitions(p)
	if err != nil {
		return nil, err
	}
	converted := []any{}
	for _, raw := range tools {
		fn := textMap(textMap(raw)["function"])
		tool := map[string]any{"name": fn["name"]}
		if v, ok := fn["description"]; ok {
			tool["description"] = v
		}
		schema := fn["parameters"]
		if schema == nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		tool["input_schema"] = schema
		if v, ok := fn["strict"]; ok {
			tool["strict"] = v
		}
		converted = append(converted, tool)
	}
	if len(converted) > 0 {
		out["tools"] = converted
	}
	if choice, ok := p["tool_choice"]; ok {
		cfg := map[string]any{}
		switch choice {
		case "none":
			cfg["type"] = "none"
		case "auto":
			cfg["type"] = "auto"
		case "required":
			cfg["type"] = "any"
		default:
			name := textString(textMap(textMap(choice)["function"])["name"])
			if name == "" {
				return nil, errors.New("unsupported Claude tool choice")
			}
			cfg["type"] = "tool"
			cfg["name"] = name
		}
		if p["parallel_tool_calls"] == false {
			cfg["disable_parallel_tool_use"] = true
		}
		out["tool_choice"] = cfg
	} else if p["parallel_tool_calls"] == false {
		out["tool_choice"] = map[string]any{"type": "auto", "disable_parallel_tool_use": true}
	}
	if err := anthropicReasoning(out, p, model); err != nil {
		return nil, err
	}
	return out, nil
}

func appendAnthropicContent(messages *[]any, role string, parts []any) {
	if len(*messages) > 0 {
		last := textMap((*messages)[len(*messages)-1])
		if last["role"] == role {
			last["content"] = append(textArray(last["content"]), parts...)
			return
		}
	}
	*messages = append(*messages, map[string]any{"role": role, "content": parts})
}

func anthropicParts(ctx context.Context, msg map[string]any) ([]any, error) {
	parts, err := textContentParts(msg)
	if err != nil {
		return nil, err
	}
	out := []any{}
	for _, raw := range parts {
		part := textMap(raw)
		switch textString(part["type"]) {
		case "text":
			if s := textString(part["text"]); s != "" {
				out = append(out, map[string]any{"type": "text", "text": s})
			}
		case "image_url":
			mime, data, err := textImage(ctx, textString(textMap(part["image_url"])["url"]))
			if err != nil {
				return nil, failTextImage(part, err)
			}
			out = append(out, map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": mime, "data": data}})
		default:
			return nil, errors.New("unsupported Claude message content part")
		}
	}
	return out, nil
}

func anthropicResponse(data map[string]any, model string) (map[string]any, error) {
	finish := textString(data["stop_reason"])
	reason := "stop"
	switch finish {
	case "end_turn", "stop_sequence":
	case "max_tokens":
		reason = "length"
	case "tool_use":
		reason = "tool_calls"
	case "refusal":
		reason = "content_filter"
	default:
		return nil, fmt.Errorf("Claude incomplete or failed stop reason %q", finish)
	}
	blocks := textArray(data["content"])
	var content, thinking strings.Builder
	calls := []any{}
	for _, raw := range blocks {
		block := textMap(raw)
		switch textString(block["type"]) {
		case "text":
			content.WriteString(textString(block["text"]))
		case "thinking":
			if textString(block["signature"]) == "" {
				return nil, errors.New("Claude thinking block has no signature")
			}
			thinking.WriteString(textString(block["thinking"]))
		case "tool_use":
			id, name := textString(block["id"]), textString(block["name"])
			args, err := textArguments(block["input"])
			if id == "" || name == "" || err != nil {
				return nil, errors.New("Claude returned incomplete tool call")
			}
			b, _ := json.Marshal(args)
			call := map[string]any{"id": id, "type": "function", "function": map[string]any{"name": name, "arguments": string(b)}}
			if extra := textMap(block["extra_content"]); extra != nil {
				call["extra_content"] = extra
			}
			calls = append(calls, call)
		}
	}
	if len(calls) > 0 && finish != "tool_use" {
		return nil, errors.New("Claude returned unfinished tool calls")
	}
	if finish == "tool_use" && len(calls) == 0 {
		return nil, errors.New("Claude tool stop contains no tool calls")
	}
	result := textResult("anthropic", model, blocks, content.String(), thinking.String(), reason, calls, anthropicUsage(textMap(data["usage"])))
	if id := textString(data["id"]); id != "" {
		result["id"] = id
	}
	return result, nil
}

func anthropicUsage(native map[string]any) map[string]any {
	usage := map[string]any{}
	// Anthropic input_tokens excludes cache reads/writes. Include the reported
	// components in OpenAI prompt_tokens; preserve each component separately.
	input, hasInput := native["input_tokens"]
	output, hasOutput := native["output_tokens"]
	if hasInput {
		prompt := textNumber(input)
		for _, key := range []string{"cache_creation_input_tokens", "cache_read_input_tokens"} {
			prompt += textNumber(native[key])
		}
		usage["prompt_tokens"] = prompt
	}
	if hasOutput {
		usage["completion_tokens"] = output
	}
	if hasInput && hasOutput {
		usage["total_tokens"] = textNumber(usage["prompt_tokens"]) + textNumber(output)
	}
	details := map[string]any{}
	if v, ok := native["cache_read_input_tokens"]; ok {
		details["cached_tokens"] = v
	}
	if v, ok := native["cache_creation_input_tokens"]; ok {
		details["cache_creation_tokens"] = v
	}
	if len(details) > 0 {
		usage["prompt_tokens_details"] = details
	}
	return usage
}

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
		return streamFailureReceipt("anthropic", model, result), err
	}
	if !stopped {
		return streamFailureReceipt("anthropic", model, result), errors.New("Claude stream ended before message_stop")
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
	response, err := anthropicResponse(result, model)
	if err != nil {
		return streamFailureReceipt("anthropic", model, result), err
	}
	return response, nil
}
