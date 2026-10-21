package generate

import (
	"fmt"
	"regexp"
	"strings"
)

var videoDiagnosticURL = regexp.MustCompile(`(?i)(?:https?://|data:)[^\s"<>]+`)
var videoDiagnosticSecret = regexp.MustCompile(`(?i)(?:bearer\s+|(?:api[_-]?key|token|authorization|secret)\s*[=:]\s*)[^\s,;"}]+`)

func safeVideoSubmitReason(message, key string, status, attempts int) string {
	if key != "" {
		message = strings.ReplaceAll(message, key, "[已隐藏]")
	}
	message = videoDiagnosticURL.ReplaceAllString(message, "[地址已隐藏]")
	message = videoDiagnosticSecret.ReplaceAllString(message, "[凭据已隐藏]")
	text := []rune(strings.TrimSpace(message))
	if len(text) > 240 {
		text = text[:240]
	}
	stage := "网络或响应读取阶段"
	if status > 0 {
		stage = fmt.Sprintf("上游 HTTP %d", status)
	}
	return fmt.Sprintf("%s（%s，尝试 %d 个端点）", string(text), stage, attempts)
}
