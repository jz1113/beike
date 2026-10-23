package poster

import (
	"encoding/json"

	"beike.local/cloud/src/backend/internal/generate"
)

func headlineTitleSchemaError(body []byte) string {
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
	if message := optionalTrimmed(obj, "originalTitle", 2000, "标题最多 2000 字"); message != "" {
		return "originalTitle: " + message
	}
	if message := productNameError(obj); message != "" {
		return "productName: " + message
	}
	if message := boundedImageURLs(obj, 1, "标题改写需要商品图片", "标题改写只使用一张商品图片"); message != "" {
		return message
	}
	if message := optionalTrimmed(obj, "customBaseUrl", 2048, ""); message != "" {
		return "customBaseUrl: " + message
	}
	if message := optionalTrimmed(obj, "customApiKey", 4096, ""); message != "" {
		return "customApiKey: " + message
	}
	return ""
}
