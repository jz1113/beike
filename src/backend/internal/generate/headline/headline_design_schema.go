package headline

import (
	"beike.local/cloud/src/backend/internal/generate"
	"encoding/json"
	"fmt"
	"strings"
)

func headlineDesignSchemaError(body []byte) string {
	var raw any
	if json.Unmarshal(body, &raw) != nil {
		return "请求数据格式异常"
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return "Expected object, received " + generate.ZodReceived(raw)
	}
	if message := optionalTrimmed(obj, "model", 160, ""); message != "" {
		return "model: " + message
	}
	for _, key := range []string{"originalTitle", "coverTitle", "productTitle"} {
		if message := optionalTrimmed(obj, key, 2000, "标题最多 2000 字"); message != "" {
			return key + ": " + message
		}
	}
	if message := productNameError(obj); message != "" {
		return "productName: " + message
	}
	if message := boundedImageURLs(obj, 2, "封面设计需要商品图片", "最多使用两张商品图片"); message != "" {
		return message
	}
	if message := generate.OptionalEnum(obj, "aspectRatio", "'3:4' | '1:1'", "3:4", "1:1"); message != "" {
		return "aspectRatio: " + message
	}
	for _, key := range []string{"batchId", "itemId"} {
		if message := optionalTrimmed(obj, key, 128, ""); message != "" {
			return key + ": " + message
		}
	}
	if message := optionalTrimmed(obj, "itemTitle", 200, ""); message != "" {
		return "itemTitle: " + message
	}
	if message := optionalTrimmed(obj, "previousDesign", 2000, "上一张设计摘要最多 2000 字"); message != "" {
		return "previousDesign: " + message
	}
	if message := optionalTrimmed(obj, "memorySampleId", 128, ""); message != "" {
		return "memorySampleId: " + message
	}
	if message := optionalTrimmed(obj, "customBaseUrl", 2048, ""); message != "" {
		return "customBaseUrl: " + message
	}
	if message := optionalTrimmed(obj, "customApiKey", 4096, ""); message != "" {
		return "customApiKey: " + message
	}
	return ""
}

func optionalTrimmed(obj map[string]any, key string, max int, custom string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return "Expected string, received " + generate.ZodReceived(value)
	}
	if generate.Utf16Len(strings.TrimSpace(text)) > max {
		if custom != "" {
			return custom
		}
		return fmt.Sprintf("String must contain at most %d character(s)", max)
	}
	return ""
}

func productNameError(obj map[string]any) string {
	value, ok := obj["productName"]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return "Expected string, received " + generate.ZodReceived(value)
	}
	if generate.Utf16Len(text) > 128 {
		return "String must contain at most 128 character(s)"
	}
	if generate.Utf16Len(strings.Join(strings.Fields(text), " ")) > 64 {
		return "商品名称/型号最多 64 字"
	}
	return ""
}

func boundedImageURLs(obj map[string]any, maxCount int, minMessage, maxMessage string) string {
	value, ok := obj["imageUrls"]
	if !ok {
		return "imageUrls: Required"
	}
	items, ok := value.([]any)
	if !ok {
		return "imageUrls: Expected array, received " + generate.ZodReceived(value)
	}
	if len(items) < 1 {
		return "imageUrls: " + minMessage
	}
	if len(items) > maxCount {
		return "imageUrls: " + maxMessage
	}
	for index, item := range items {
		text, ok := item.(string)
		if !ok {
			return fmt.Sprintf("imageUrls.%d: Expected string, received %s", index, generate.ZodReceived(item))
		}
		text = strings.TrimSpace(text)
		if text == "" {
			return fmt.Sprintf("imageUrls.%d: String must contain at least 1 character(s)", index)
		}
		if generate.Utf16Len(text) > 36*1024*1024 {
			return fmt.Sprintf("imageUrls.%d: 商品图片数据过大", index)
		}
	}
	return ""
}
