package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestVideoPromptLimitsCountUnicodeAndPreserveWholeText(t *testing.T) {
	for _, item := range []struct {
		model string
		limit int
	}{
		{"MiniMax-H3", 7000}, {"h3", 7000},
		{"wan3.0-video", 20000}, {"wan3.0-video-prime", 20000},
	} {
		t.Run(item.model, func(t *testing.T) {
			prompt := strings.Repeat("衣", item.limit-1) + "🙂"
			payload := map[string]json.RawMessage{"prompt": rawJSON(t, prompt), "preserve_prompt": rawJSON(t, true)}
			if message := videoPromptInputError(payload, item.model); message != "" {
				t.Fatal(message)
			}
			payload["prompt"] = rawJSON(t, prompt+"尾")
			if message := videoPromptInputError(payload, item.model); !strings.Contains(message, "请精简") {
				t.Fatalf("overlong prompt was accepted: %s", message)
			}
		})
	}
}

func TestH3PromptLimitIncludesAdapterWrittenSilence(t *testing.T) {
	payload := map[string]json.RawMessage{"prompt": rawJSON(t, strings.Repeat("衣", 7000)), "audio": rawJSON(t, false)}
	if message := videoPromptInputError(payload, "MiniMax-H3"); message == "" {
		t.Fatal("adapter silence text bypassed the provider's limit")
	}
	payload["preserve_prompt"] = rawJSON(t, true)
	if message := videoPromptInputError(payload, "MiniMax-H3"); message != "" {
		t.Fatal(message)
	}
}

func TestOverlongVideoPromptRejectsBeforeStorageOrUpstream(t *testing.T) {
	for _, model := range []string{"MiniMax-H3", "wan3.0-video"} {
		body, _ := json.Marshal(map[string]any{
			"model": model, "prompt": strings.Repeat("衣", 20001), "preserve_prompt": true,
			"ref_mode": "omni", "images": []string{"/storage/local/missing.png"},
		})
		response := httptest.NewRecorder()
		Video(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body))))
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "提示词最多") {
			t.Fatalf("model=%s status=%d body=%s", model, response.Code, response.Body.String())
		}
	}
}

func TestWanSeedRetainsZeroAndRandomSentinel(t *testing.T) {
	for _, seed := range []int64{-1, 0, 42, 2147483647} {
		payload := map[string]json.RawMessage{"seed": rawJSON(t, seed)}
		if message := videoSeedInputError(payload, "wan3.0-video"); message != "" {
			t.Fatal(message)
		}
		body := buildVideoPayload("wan3.0-video", "展示衣服", payload).payload
		if got := body["parameters"].(map[string]any)["seed"]; got != seed {
			t.Fatalf("seed changed: got=%v want=%v", got, seed)
		}
	}
	for _, seed := range []int64{-2, 2147483648} {
		if message := videoSeedInputError(map[string]json.RawMessage{"seed": rawJSON(t, seed)}, "wan3.0-video"); message == "" {
			t.Fatalf("invalid seed accepted: %d", seed)
		}
	}
	body := buildVideoPayload("wan3.0-video", "展示衣服", nil).payload
	if _, exists := body["parameters"].(map[string]any)["seed"]; exists {
		t.Fatal("unspecified seed was introduced")
	}
}
