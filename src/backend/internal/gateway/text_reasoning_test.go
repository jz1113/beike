package gateway

import (
	"context"
	"testing"
)

func TestAdaptiveDefaultOmitsLegacySampling(t *testing.T) {
	p := textTestPayload("claude-haiku-5-5")
	p["temperature"], p["top_p"] = .2, .9
	out, err := anthropicRequest(context.Background(), p, "claude-haiku-5-5", false)
	if err != nil || out["temperature"] != nil || out["top_p"] != nil || out["thinking"] != nil {
		t.Fatalf("default adaptive sampling: %v %v", out, err)
	}
}

func TestVerifiedCapabilityNormalization(t *testing.T) {
	for _, tc := range []struct{ model, effort, want string }{
		{"gemini-4-argon", "xhigh", "high"},
		{"gemini-3-pro-preview", "medium", "high"},
		{"claude-haiku-5-5", "xhigh", "xhigh"},
		{"claude-sonnet-4-6", "xhigh", "high"},
		{"claude-5.5-haiku", "high", ""},
		{"gemini-unknown", "high", ""},
		{"claude-haiku-4-5-20251001", "high", "high"},
	} {
		if got := nativeTextEffort(tc.model, tc.effort); got != tc.want {
			t.Errorf("%s/%s: got %q want %q", tc.model, tc.effort, got, tc.want)
		}
	}
}

func TestUnknownNativeModelsOmitUnverifiedThinking(t *testing.T) {
	for _, protocol := range []string{"gemini", "anthropic"} {
		out := map[string]any{"max_tokens": 4096}
		p := map[string]any{"reasoning_effort": "high"}
		var err error
		if protocol == "gemini" {
			err = geminiReasoning(out, p, "gemini-private-alias")
		} else {
			err = anthropicReasoning(out, p, "claude-private-alias")
		}
		if err != nil || out["thinking"] != nil || out["thinkingConfig"] != nil || out["output_config"] != nil {
			t.Fatalf("%s unverified thinking: %v %v", protocol, out, err)
		}
	}
}
