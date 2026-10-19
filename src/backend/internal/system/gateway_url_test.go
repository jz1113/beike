package system

import "testing"

func TestChatCompletionsURL(t *testing.T) {
	if got := ChatCompletionsURL("http://127.0.0.1:9"); got != "http://127.0.0.1:9/v1/chat/completions" {
		t.Fatalf("local %s", got)
	}
	if got := ChatCompletionsURL("https://api.openai.com/v1"); got != "https://api.openai.com/v1/chat/completions" {
		t.Fatalf("openai %s", got)
	}
	if got := ChatCompletionsURL("https://maas.qianwenaiapi.com"); got != "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" {
		t.Fatalf("qianwen %s", got)
	}
	if got := ModelsURL("https://dashscope.aliyuncs.com/api/v1"); got != "https://dashscope.aliyuncs.com/compatible-mode/v1/models" {
		t.Fatalf("models %s", got)
	}
	if got := ChatCompletionsURL("https://maas.qianwenaiapi.com/compatible-mode/v1"); got != "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" {
		t.Fatalf("already %s", got)
	}
	if DashScopeRoot("https://maas.qianwenaiapi.com/compatible-mode/v1") != "https://maas.qianwenaiapi.com" {
		t.Fatalf("root %s", DashScopeRoot("https://maas.qianwenaiapi.com/compatible-mode/v1"))
	}
	if IsDashScopeGateway("https://evil-dashscope.example.com") || !IsDashScopeGateway("https://dashscope-intl.aliyuncs.com") {
		t.Fatal("host detection")
	}
}
