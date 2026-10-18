package catalog

func qiyunError(data map[string]any) string {
	switch codeText(data["code"]) {
	case "204":
		return "暂时不支持解析该平台或作者设置了权限"
	case "500":
		return "解析失败，请检查链接是否正确或该作品是否已被删除"
	case "1001":
		return "参数错误，请检查请求参数"
	case "3001":
		return "请求过于频繁，请稍后再试"
	case "3002":
		return "奇云解析调用次数不足，请升级套餐或充值"
	case "3003":
		return "奇云解析今日调用次数已达上限"
	}
	if text, _ := data["msg"].(string); text != "" {
		return text
	}
	return "短视频或图集解析异常"
}

func apiaError(code string, data map[string]any) string {
	switch code {
	case "103":
		return "请输入正确的作品链接"
	case "104":
		return "该解析接口已暂停使用"
	case "110":
		return "解析次数不足，请稍后再试"
	case "114":
		return "作品不存在或当前链接不受支持，请检查作品是否公开或换用 App 分享短链"
	case "155":
		return "接口密钥配置错误"
	}
	if text, _ := data["msg"].(string); text != "" {
		return text
	}
	return "作品链接解析异常"
}
