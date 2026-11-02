package sales

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
)

type summaryFailure struct {
	Code    string `json:"code"`
	Stage   string `json:"stage"`
	Message string `json:"error"`
	Detail  string `json:"detail,omitempty"`
}

var summaryErrorURL = regexp.MustCompile(`(?i)https?://[^\s<>"']+`)
var summaryErrorData = regexp.MustCompile(`(?i)data:[^\s"']+`)
var summaryErrorCredential = regexp.MustCompile(`(?i)(?:bearer\s+|(?:api[_-]?key|authorization|token)["'\s:=]+)[^\s,"'<>]+`)

// Upstream errors may echo credentials or image data. Neither belongs in the UI or logs.
func summarySafeDetail(err error, key string) string {
	if err == nil {
		return ""
	}
	text := err.Error()
	if key != "" {
		text = strings.ReplaceAll(text, key, "[密钥已隐藏]")
	}
	text = summaryErrorData.ReplaceAllString(text, "[图片数据已隐藏]")
	text = summaryErrorURL.ReplaceAllString(text, "[接口地址]")
	text = summaryErrorCredential.ReplaceAllString(text, "[凭证已隐藏]")
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > 350 {
		text = string(runes[:350]) + "…"
	}
	return text
}

func classifySummaryFailure(ctx context.Context, status int, err error, key string) summaryFailure {
	failure := summaryFailure{Code: "model_request", Stage: "model", Message: "模型调用失败", Detail: summarySafeDetail(err, key)}
	var imageError *gateway.TextImageError
	var indexed *gateway.IndexedImageError
	switch {
	case ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded):
		failure.Code, failure.Message = "model_timeout", "模型调用已取消或超时，请稍后重试"
	case errors.As(err, &imageError) || errors.As(err, &indexed):
		failure.Code, failure.Stage, failure.Message = "image_prepare", "images", "商品图片转换失败，请检查原图格式和尺寸"
	case status == http.StatusForbidden && strings.Contains(strings.ToLower(failure.Detail), "verify your account"):
		failure.Code, failure.Stage, failure.Message = "model_account_verification", "channel", "当前模型渠道要求验证上游账号，请在渠道侧完成验证或切换可用渠道"
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		failure.Code, failure.Message = "model_auth", "模型渠道鉴权失败，请检查所选渠道密钥或权限"
	case status == http.StatusTooManyRequests:
		failure.Code, failure.Message = "model_quota", "模型渠道限流或余额不足"
	case status == http.StatusNotFound:
		failure.Code, failure.Message = "model_route", "渠道未找到所选模型或协议接口，请检查模型 ID 与渠道协议"
	case status == http.StatusBadRequest || status == http.StatusUnprocessableEntity:
		failure.Code, failure.Message = "model_parameters", "模型渠道拒绝了请求参数"
	case status >= 500:
		failure.Code, failure.Message = "model_unavailable", "模型渠道服务异常，请稍后重试"
	case errors.Is(err, gateway.ErrInvalidTextJSON):
		failure.Code, failure.Stage, failure.Message = "model_json", "response", "模型未返回有效 JSON，未保存不完整文案"
	case status >= 200 && status < 300:
		failure.Code, failure.Stage, failure.Message = "model_response", "response", "渠道已响应，但返回内容无法解析"
	}
	if status != 0 {
		failure.Message += fmt.Sprintf("（上游 HTTP %d）", status)
	}
	if failure.Detail != "" {
		failure.Message += "：" + failure.Detail
	}
	return failure
}
