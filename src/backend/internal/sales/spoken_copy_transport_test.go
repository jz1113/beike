package sales

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSpokenCopyResponsesTransportSendsExactSavedTextAndParsesCompletion(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	saved := customizePrompt(t, cfg, "spoken-copy")
	review := customizePrompt(t, cfg, "spoken-review")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("wrong Responses route or credentials: %s", r.URL.Path)
		}
		var body struct {
			Model string `json:"model"`
			Input []struct {
				Role    string `json:"role"`
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
			} `json:"input"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Model != "gpt-5.4" || len(body.Input) != 2 || len(body.Input[0].Content) != 1 || len(body.Input[1].Content) != 1 {
			t.Error("Responses adapter lost model or messages")
			http.Error(w, "invalid input", 400)
			return
		}
		if body.Input[0].Role != "system" || body.Input[0].Content[0].Type != "input_text" {
			t.Error("saved prompt changed before vendor transport")
		}
		if body.Input[0].Content[0].Text == review.Prompt {
			text, ok := strings.CutPrefix(body.Input[1].Content[0].Text, "口播验收数据：\n")
			var input struct {
				DraftDigest string `json:"draftDigest"`
			}
			if !ok || json.Unmarshal([]byte(text), &input) != nil || len(input.DraftDigest) != 64 {
				t.Error("review lost the current draft digest")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": `{"draftDigest":"` + input.DraftDigest + `","approved":true,"issues":[]}`})
			return
		}
		if body.Input[0].Content[0].Text != saved.Prompt {
			t.Error("generation prompt changed before vendor transport")
		}
		text, ok := strings.CutPrefix(body.Input[1].Content[0].Text, "口播输入数据：\n")
		var input spokenCopyInput
		if body.Input[1].Role != "user" || !ok || json.Unmarshal([]byte(text), &input) != nil || input.SourceCopy == "" || input.Duration != 6.3 || input.VoiceMode != "speech" || len(input.Beats) != 2 {
			t.Error("raw copy or timeline was lost or extra instructions were appended")
		} else if input.Beats[0].SourceVoiceText != "旧品牌原话" || input.Beats[0].SourceLinePattern != "开场介绍" || input.Beats[0].SourceSubtitle != "原片字幕" || len(input.SourceExclusions) != 1 || input.SourceExclusions[0].Term != "旧品牌" {
			t.Errorf("source speech or exclusions lost: %+v", input)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": spokenCopyTestResult})
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = server.Client
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	var input map[string]any
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
		t.Fatal(err)
	}
	input["model"], input["apiFormat"], input["customBaseUrl"], input["customApiKey"] = "openai-responses:gpt-5.4", "openai-responses", server.URL, "test-key"
	input["sourceExclusions"] = []any{map[string]any{"term": "旧品牌", "type": "brand_signage"}}
	beats := input["beats"].([]any)
	beat := beats[0].(map[string]any)
	beat["sourceVoiceText"], beat["sourceLinePattern"], beat["sourceSubtitle"] = "旧品牌原话", "开场介绍", "原片字幕"
	body, _ := json.Marshal(input)
	response := httptest.NewRecorder()
	SpokenCopy(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(body))))
	if response.Code != 200 || calls != 2 || !strings.Contains(response.Body.String(), saved.Version) || !strings.Contains(response.Body.String(), review.Version) {
		t.Fatalf("Responses adaptation failed: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestSpokenCopyAcceptsProductNameWhenNoLongCopyExists(t *testing.T) {
	input := spokenCopyRequest{spokenCopyInput: spokenCopyInput{ProductName: "条纹上衣", VoiceMode: "voiceover", Duration: 6, TargetCps: 3.8, Beats: []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6}}}, Model: "gpt-4o"}
	if err := validateSpokenCopyInput(input); err != nil {
		t.Fatalf("factual product name alone should allow minimal copy: %v", err)
	}
}

func TestSpokenCopyRejectsUnconfirmedSourceTermsButAllowsCurrentProductFacts(t *testing.T) {
	input := spokenCopyInput{ProductName: "条纹上衣", VoiceMode: "speech", Duration: 6, TargetCps: 3.8,
		SourceExclusions: []planSourceExclusion{{Term: "旧品牌", Type: "brand_signage"}},
		Beats:            []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6}}}
	result := scriptCompletion(`{"beats":[{"index":0,"spokenLine":"看看旧品牌上衣","subtitle":"旧品牌"}]}`, "stop")
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "原片内容") {
		t.Fatalf("unconfirmed source term should be rejected: %v", err)
	}
	input.Facts = "旧品牌为当前商品品牌"
	if _, _, err := parseSpokenCopy(result, input); err != nil {
		t.Fatalf("term explicitly confirmed by current product facts should be allowed: %v", err)
	}
	input.Facts = ""
	input.SourceCopy = "当前商品的旧品牌"
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "原片内容") {
		t.Fatalf("generated copy must not prove an excluded source term: %v", err)
	}
	input.SourceCopy = "穿上显瘦"
	result = scriptCompletion(`{"beats":[{"index":0,"spokenLine":"穿上显瘦","subtitle":"显瘦"}]}`, "stop")
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "未经证实") {
		t.Fatalf("recommendation alone must not bypass promise validation: %v", err)
	}
}
