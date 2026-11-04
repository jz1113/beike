package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVideoPreservePromptOnlyChangesOptedInAdapterPolicy(t *testing.T) {
	const prompt = "当前模板：\n商品参考 图片1，保留「自然动作」。"
	for _, preserve := range []string{"absent", "false", "true"} {
		t.Run(preserve, func(t *testing.T) {
			payload := map[string]json.RawMessage{"audio": rawJSON(t, false)}
			if preserve != "absent" {
				payload["preserve_prompt"] = json.RawMessage(preserve)
			}
			minimax := buildVideoPayload("MiniMax-H3", prompt, payload).payload
			minimaxText := minimax["content"].([]map[string]any)[0]["text"]
			wan := buildVideoPayload("wan3.0-video", prompt, payload).payload
			parameters := wan["parameters"].(map[string]any)
			if preserve == "true" {
				if minimaxText != prompt || parameters["prompt_extend"] != false {
					t.Fatalf("managed prompt changed: minimax=%#v wan=%#v", minimax, wan)
				}
			} else if minimaxText != prompt+" (silent video, no sound)" || parameters["prompt_extend"] != true {
				t.Fatalf("default adapter behavior changed: minimax=%#v wan=%#v", minimax, wan)
			}
			if wan["input"].(map[string]any)["prompt"] != prompt || parameters["audio"] != false {
				t.Fatalf("prompt/audio intent lost: %#v", wan)
			}
			if minimax["preserve_prompt"] != nil || wan["preserve_prompt"] != nil {
				t.Fatal("local transport flag reached provider")
			}
		})
	}
}

func TestVideoPreservePromptRetainsFinalTextThroughSubmission(t *testing.T) {
	const prompt = "  当前模板：\n商品参考 图片1，保留「自然动作」。\n"
	for _, model := range []string{"MiniMax-H3", "wan3.0-video", "doubao-seedance-2.5"} {
		t.Run(model, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
					http.Error(w, "invalid payload", http.StatusBadRequest)
					return
				}
				var text any
				switch model {
				case "wan3.0-video":
					text = body["input"].(map[string]any)["prompt"]
					if body["parameters"].(map[string]any)["prompt_extend"] != false {
						t.Error("upstream prompt rewriting is enabled")
					}
				case "doubao-seedance-2.5":
					text = body["content"].([]any)[0].(map[string]any)["text"]
				default:
					text = body["prompt"]
				}
				if text != prompt || body["preserve_prompt"] != nil {
					t.Errorf("outbound text=%q flag=%v", text, body["preserve_prompt"])
				}
				_, _ = w.Write([]byte(`{"task_id":"preserved-video"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			body, _ := json.Marshal(map[string]any{
				"prompt": prompt, "preserve_prompt": true, "model": model, "duration": 5,
				"resolution": "720P", "ref_mode": "text", "audio": false,
				"customBaseUrl": server.URL, "customApiKey": "test-key", "clientTaskId": "preserve-prompt",
			})
			response := httptest.NewRecorder()
			Video(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body))))
			if response.Code != http.StatusOK || calls != 1 {
				t.Fatalf("status=%d calls=%d body=%s", response.Code, calls, response.Body.String())
			}
		})
	}
}

func TestVideoPreservePromptRejectsNonBooleanValues(t *testing.T) {
	for _, value := range []string{`"true"`, `null`, `1`, `{}`} {
		if message := videoBodyError(map[string]json.RawMessage{
			"prompt": rawJSON(t, "当前模板"), "preserve_prompt": json.RawMessage(value),
		}); !strings.Contains(message, "Expected boolean") {
			t.Fatalf("value=%s message=%s", value, message)
		}
	}
}
