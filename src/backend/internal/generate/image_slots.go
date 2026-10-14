package generate

import (
	"encoding/json"
	"strings"
)

func workshopProductImageError(payload map[string]json.RawMessage) string {
	if rawString(payload, "workshopMode") != "storyboard_generate" {
		return ""
	}
	if strings.TrimSpace(rawString(payload, "productImageUrl")) == "" {
		return "原创生图缺少商品垫图（@图片1）。请在素材步选好商品图并开启「强制跟商品图」。"
	}
	return ""
}
