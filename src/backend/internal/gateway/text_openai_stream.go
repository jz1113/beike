package gateway

import (
	"bytes"
	"errors"
	"io"
	"sort"
)

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
		if err != nil {
			return false, err
		}
		for _, key := range []string{"id", "model", "created", "system_fingerprint", "usage"} {
			if value, ok := data[key]; ok {
				result[key] = value
			}
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
		return nil, err
	}
	if !done || finish == "" {
		return nil, errors.New("OpenAI stream ended without completion markers")
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
		return nil, err
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
