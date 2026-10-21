package videosales

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

func oneSalesScript(content string) (SalesScript, string, error) {
	raw, ok := scriptJSONObject(content)
	if !ok {
		return SalesScript{}, "", fmt.Errorf("脚本模型已返回结果，但 JSON 不完整或语法错误；请重新生成脚本")
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return SalesScript{}, "", fmt.Errorf("脚本模型已返回结果，但 JSON 不完整或语法错误；请重新生成脚本")
	}
	root, _ := coerceScriptJSON(value).(map[string]any)
	list := scriptList(root)
	if list == nil {
		return SalesScript{}, "", fmt.Errorf("脚本模型已返回 JSON，但缺少 scripts 数组或脚本结构不符")
	}
	if len(list) != 1 {
		return SalesScript{}, "", fmt.Errorf("脚本模型返回了 %d 套脚本，当前需要且只能接收 1 套", len(list))
	}
	normalized, err := json.Marshal(map[string]any{"scripts": list})
	if err != nil {
		return SalesScript{}, "", fmt.Errorf("脚本结果必须为一套有效脚本 JSON")
	}
	var parsed struct {
		Scripts []SalesScript `json:"scripts"`
	}
	if err := json.Unmarshal(normalized, &parsed); err != nil {
		if mismatch, ok := err.(*json.UnmarshalTypeError); ok {
			return SalesScript{}, "", fmt.Errorf("脚本模型已返回 JSON，但 %s 字段类型不符，预期 %s；请重新生成脚本", mismatch.Field, scriptFieldType(mismatch.Type.Kind()))
		}
		return SalesScript{}, "", fmt.Errorf("脚本模型已返回 JSON，但脚本字段无法解析；请重新生成脚本")
	}
	return parsed.Scripts[0], string(normalized), nil
}

func scriptFieldType(kind reflect.Kind) string {
	switch kind {
	case reflect.String:
		return "字符串"
	case reflect.Int:
		return "整数"
	case reflect.Bool:
		return "布尔值"
	case reflect.Slice:
		return "数组"
	default:
		return "对象"
	}
}

func scriptList(root map[string]any) []any {
	if root == nil {
		return nil
	}
	switch scripts := root["scripts"].(type) {
	case []any:
		return scripts
	case map[string]any:
		return []any{scripts}
	}
	if one, ok := root["script"].(map[string]any); ok {
		return []any{one}
	}
	if _, ok := root["shots"].([]any); ok {
		return []any{root}
	}
	return nil
}

func scriptJSONObject(content string) ([]byte, bool) {
	text := strings.TrimSpace(content)
	if raw, ok := jsonObjectBytes(text); ok {
		return raw, true
	}
	stripped := stripMarkdownFence(text)
	if raw, ok := jsonObjectBytes(stripped); ok {
		return raw, true
	}
	start := strings.Index(stripped, "{")
	end := strings.LastIndex(stripped, "}")
	if start < 0 || end <= start {
		return nil, false
	}
	return jsonObjectBytes(stripped[start : end+1])
}

func jsonObjectBytes(text string) ([]byte, bool) {
	var value any
	if json.Unmarshal([]byte(text), &value) != nil {
		return nil, false
	}
	if _, ok := value.(map[string]any); !ok {
		return nil, false
	}
	return []byte(text), true
}

func stripMarkdownFence(content string) string {
	text := strings.TrimSpace(content)
	if !strings.HasPrefix(text, "```") {
		return text
	}
	text = strings.TrimPrefix(text, "```")
	if newline := strings.IndexByte(text, '\n'); newline >= 0 {
		text = text[newline+1:]
	} else {
		text = strings.TrimPrefix(text, "json")
	}
	return strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(text), "```"))
}

func coerceScriptJSON(value any) any {
	switch node := value.(type) {
	case map[string]any:
		for key, child := range node {
			if child == nil {
				delete(node, key)
				continue
			}
			node[key] = coerceScriptJSON(child)
		}
		coerceIntFields(node, "shotId", "duration", "totalDuration", "imageIndex")
		coerceBoolFields(node, "required", "usesProduct")
		if tags, ok := node["hashtags"].(string); ok {
			node["hashtags"] = splitHashtags(tags)
		}
		// Subtitles are forbidden and overlays are never consumed by this flow.
		delete(node, "textOverlay")
		if refs, ok := node["referenceAssetIds"].(string); ok && strings.TrimSpace(refs) == "" {
			node["referenceAssetIds"] = []string{}
		}
		if seo, ok := node["seo"]; ok {
			if _, isObject := seo.(map[string]any); !isObject {
				delete(node, "seo")
			}
		}
		return node
	case []any:
		for i, child := range node {
			node[i] = coerceScriptJSON(child)
		}
		return node
	default:
		return value
	}
}

func coerceIntFields(node map[string]any, keys ...string) {
	for _, key := range keys {
		text, ok := node[key].(string)
		if !ok {
			continue
		}
		number, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
		if err != nil || number != float64(int(number)) {
			continue
		}
		node[key] = int(number)
	}
}

func coerceBoolFields(node map[string]any, keys ...string) {
	for _, key := range keys {
		text, ok := node[key].(string)
		if !ok {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(text)) {
		case "true":
			node[key] = true
		case "false":
			node[key] = false
		}
	}
}

func splitHashtags(text string) []string {
	parts := strings.FieldsFunc(text, func(r rune) bool {
		return r == ',' || r == '，' || r == ' ' || r == '\n'
	})
	tags := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			tags = append(tags, part)
		}
	}
	return tags
}
