package modelgw

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func geminiRequest(ctx context.Context, p map[string]any, model string) (map[string]any, error) {
	out := map[string]any{}
	contents := []any{}
	system := []any{}
	names := map[string]string{}
	nativeIDs := map[string]bool{}
	for _, raw := range textArray(p["messages"]) {
		msg := textMap(raw)
		role := textString(msg["role"])
		if role == "tool" {
			id := textString(msg["tool_call_id"])
			name := names[id]
			if name == "" {
				return nil, errors.New("Gemini tool result has no matching call")
			}
			result := any(msg["content"])
			if s, ok := result.(string); ok {
				var parsed any
				if json.Unmarshal([]byte(s), &parsed) == nil {
					result = parsed
				}
			}
			response := textMap(result)
			if response == nil {
				response = map[string]any{"result": result}
			}
			functionResponse := map[string]any{"name": name, "response": response}
			if nativeIDs[id] {
				functionResponse["id"] = id
			}
			appendGeminiContent(&contents, "user", []any{map[string]any{"functionResponse": functionResponse}})
			continue
		}
		if role != "user" && role != "assistant" && role != "system" && role != "developer" {
			return nil, fmt.Errorf("unsupported Gemini message role %q", role)
		}
		parts, err := geminiParts(ctx, msg)
		if err != nil {
			return nil, err
		}
		if role == "system" || role == "developer" {
			for _, part := range parts {
				if _, ok := textMap(part)["text"]; !ok {
					return nil, errors.New("Gemini system instruction must be text")
				}
			}
			system = append(system, parts...)
			continue
		}
		if role == "assistant" {
			calls, err := textToolCalls(msg)
			if err != nil {
				return nil, err
			}
			for _, call := range calls {
				c := textMap(call)
				names[textString(c["id"])] = textString(textMap(c["function"])["name"])
				nativeIDs[textString(c["id"])] = false
			}
			native, ok, err := textNative(msg, "gemini", model)
			if err != nil {
				return nil, err
			}
			if ok {
				parts = native
				for _, part := range native {
					id := textString(textMap(textMap(part)["functionCall"])["id"])
					if id != "" {
						nativeIDs[id] = true
					}
				}
			} else {
				for _, call := range calls {
					c := textMap(call)
					fn := textMap(c["function"])
					args, _ := textArguments(fn["arguments"])
					nativeIDs[textString(c["id"])] = true
					parts = append(parts, map[string]any{"functionCall": map[string]any{"id": c["id"], "name": fn["name"], "args": args}})
				}
			}
			role = "model"
		}
		if len(parts) > 0 {
			appendGeminiContent(&contents, role, parts)
		}
	}
	if len(contents) == 0 {
		return nil, errors.New("Gemini requires conversation content")
	}
	out["contents"] = contents
	if len(system) > 0 {
		out["systemInstruction"] = map[string]any{"parts": system}
	}
	config := map[string]any{}
	for from, to := range map[string]string{"temperature": "temperature", "top_p": "topP", "top_k": "topK", "max_tokens": "maxOutputTokens", "max_completion_tokens": "maxOutputTokens"} {
		if v, ok := p[from]; ok {
			config[to] = v
		}
	}
	if value, ok := p["max_completion_tokens"]; ok {
		config["maxOutputTokens"] = value
	}
	if stop, ok := p["stop"]; ok {
		if s, ok := stop.(string); ok {
			stop = []any{s}
		}
		config["stopSequences"] = stop
	}
	format := textMap(p["response_format"])
	switch textString(format["type"]) {
	case "json_object":
		config["responseMimeType"] = "application/json"
	case "json_schema":
		schema := textMap(format["json_schema"])["schema"]
		if textMap(schema) == nil {
			return nil, errors.New("missing Gemini JSON schema")
		}
		config["responseMimeType"] = "application/json"
		config["responseJsonSchema"] = schema
	case "", "text":
	default:
		return nil, errors.New("unsupported Gemini response format")
	}
	if err := geminiReasoning(config, p, model); err != nil {
		return nil, err
	}
	if len(config) > 0 {
		out["generationConfig"] = config
	}
	tools, err := textToolDefinitions(p)
	if err != nil {
		return nil, err
	}
	declarations := []any{}
	for _, raw := range tools {
		fn := textMap(textMap(raw)["function"])
		d := map[string]any{"name": fn["name"]}
		if v, ok := fn["description"]; ok {
			d["description"] = v
		}
		if v, ok := fn["parameters"]; ok {
			d["parametersJsonSchema"] = v
		}
		declarations = append(declarations, d)
	}
	if len(declarations) > 0 {
		out["tools"] = []any{map[string]any{"functionDeclarations": declarations}}
	}
	if choice, ok := p["tool_choice"]; ok {
		cfg := map[string]any{}
		switch choice {
		case "none":
			cfg["mode"] = "NONE"
		case "auto":
			cfg["mode"] = "AUTO"
		case "required":
			cfg["mode"] = "ANY"
		default:
			name := textString(textMap(textMap(choice)["function"])["name"])
			if name == "" {
				return nil, errors.New("unsupported Gemini tool choice")
			}
			cfg["mode"] = "ANY"
			cfg["allowedFunctionNames"] = []any{name}
		}
		out["toolConfig"] = map[string]any{"functionCallingConfig": cfg}
	}
	return out, nil
}

func appendGeminiContent(contents *[]any, role string, parts []any) {
	if len(*contents) > 0 {
		last := textMap((*contents)[len(*contents)-1])
		if last["role"] == role {
			last["parts"] = append(textArray(last["parts"]), parts...)
			return
		}
	}
	*contents = append(*contents, map[string]any{"role": role, "parts": parts})
}

func geminiParts(ctx context.Context, msg map[string]any) ([]any, error) {
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
				out = append(out, map[string]any{"text": s})
			}
		case "image_url":
			mime, data, err := textImage(ctx, textString(textMap(part["image_url"])["url"]))
			if err != nil {
				return nil, failTextImage(part, err)
			}
			out = append(out, map[string]any{"inlineData": map[string]any{"mimeType": mime, "data": data}})
		default:
			return nil, errors.New("unsupported Gemini message content part")
		}
	}
	return out, nil
}

func geminiResponse(data map[string]any, model string) (map[string]any, error) {
	candidates := textArray(data["candidates"])
	if len(candidates) == 0 {
		return nil, errors.New("Gemini returned no candidates (possibly safety blocked)")
	}
	candidate := textMap(candidates[0])
	finish := textString(candidate["finishReason"])
	reason := "stop"
	switch finish {
	case "STOP":
	case "MAX_TOKENS":
		reason = "length"
	case "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY":
		reason = "content_filter"
	default:
		return nil, fmt.Errorf("Gemini incomplete or failed finish reason %q", finish)
	}
	parts := textArray(textMap(candidate["content"])["parts"])
	var content, thinking strings.Builder
	calls := []any{}
	for i, raw := range parts {
		part := textMap(raw)
		if s, ok := part["text"].(string); ok {
			if part["thought"] == true {
				thinking.WriteString(s)
			} else {
				content.WriteString(s)
			}
		}
		if fn := textMap(part["functionCall"]); fn != nil {
			if fn["partialArgs"] != nil || fn["willContinue"] == true {
				return nil, errors.New("Gemini returned incomplete incremental tool arguments")
			}
			name := textString(fn["name"])
			arguments := fn["args"]
			if arguments == nil {
				arguments = map[string]any{}
			}
			args, err := textArguments(arguments)
			if name == "" || err != nil {
				return nil, errors.New("Gemini returned incomplete tool call")
			}
			id := textString(fn["id"])
			if id == "" {
				id = fmt.Sprintf("call_gemini_%d", i)
			}
			b, _ := json.Marshal(args)
			call := map[string]any{"id": id, "type": "function", "function": map[string]any{"name": name, "arguments": string(b)}}
			if extra := textMap(part["extra_content"]); extra != nil {
				call["extra_content"] = extra
			}
			if sig := textString(part["thoughtSignature"]); sig != "" {
				extra := textMap(call["extra_content"])
				if extra == nil {
					extra = map[string]any{}
				}
				google := textMap(extra["google"])
				if google == nil {
					google = map[string]any{}
				}
				google["thought_signature"] = sig
				extra["google"] = google
				call["extra_content"] = extra
			}
			calls = append(calls, call)
		}
	}
	if len(calls) > 0 {
		if finish != "STOP" {
			return nil, errors.New("Gemini returned unfinished tool calls")
		}
		reason = "tool_calls"
	}
	result := textResult("gemini", model, parts, content.String(), thinking.String(), reason, calls, geminiUsage(textMap(data["usageMetadata"])))
	if id := textString(data["responseId"]); id != "" {
		result["id"] = id
	}
	return result, nil
}

func geminiUsage(native map[string]any) map[string]any {
	usage := map[string]any{}
	for from, to := range map[string]string{"promptTokenCount": "prompt_tokens", "totalTokenCount": "total_tokens"} {
		if v, ok := native[from]; ok {
			usage[to] = v
		}
	}
	completion, hasCompletion := native["candidatesTokenCount"]
	thoughts, hasThoughts := native["thoughtsTokenCount"]
	if hasCompletion || hasThoughts {
		usage["completion_tokens"] = textNumber(completion) + textNumber(thoughts)
	}
	if hasThoughts {
		usage["completion_tokens_details"] = map[string]any{"reasoning_tokens": thoughts}
	}
	if cached, ok := native["cachedContentTokenCount"]; ok {
		usage["prompt_tokens_details"] = map[string]any{"cached_tokens": cached}
	}
	return usage
}
