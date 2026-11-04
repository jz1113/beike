package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestPlanAdaptReadsPersonaImageAndBindsVisibleObservations(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	cfg := setupPromptExecutionTestConfig(t)
	url, err := storeAssetCreationBytes(t.Context(), assetGridFixture(t, 600, 900), "persona", "local")
	if err != nil {
		t.Fatal(err)
	}
	body := planAdaptRequest{ProductName: "针织衫", Model: "vision-model", VoiceMode: "none", PresentationMode: "clean_visual",
		PersonaReferenceImageURL: url, PersonaPresence: "full_presenter",
		Beats: []planAdaptBeatInput{{Index: 0, Start: 0, End: 3, RefAction: "举手后回落", Expression: "抬眼后浅笑"}}}
	input, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	planAdaptHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		messages := req.Payload["messages"].([]any)
		content, ok := messages[1].(map[string]any)["content"].([]any)
		if !ok || len(content) != 2 {
			t.Fatal("adaptation did not send the actual persona image")
		}
		text := content[0].(map[string]any)["text"].(string)
		if !strings.Contains(text, `"personaReferenceImageSupplied":true`) || !strings.Contains(text, `"personaPresence":"full_presenter"`) {
			t.Fatal("visual extraction lost reference scope")
		}
		image := content[1].(map[string]any)["image_url"].(map[string]any)["url"].(string)
		if !strings.HasPrefix(image, "data:image/jpeg;base64,") || strings.Contains(image, url) {
			t.Fatal("local image must be read and encoded, not forwarded as an unreachable path")
		}
		return 200, scriptCompletion(`{"personaVisualProfile":{"imageUrl":"wrong-person.jpg","presence":"hands_only","temperament":"眉眼舒展，视觉上清爽从容","gaze":"目光聚焦镜头","expression":"嘴角轻提，笑容幅度小","posture":"肩线自然，躯干挺直","limitations":"静态参考，不能判断动作速度"},"beats":[{"index":0,"subject":"肩线自然，穿当前针织衫","action":"改成跳跃","expression":"全程大笑"}]}`, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(string(input))))
	var output struct {
		Profile *planPersonaVisualProfile `json:"personaVisualProfile"`
		Beats   []adaptedBeatOutput       `json:"beats"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &output) != nil || output.Profile == nil {
		t.Fatalf("visual adaptation failed: %d %s", rec.Code, rec.Body.String())
	}
	if output.Profile.ImageURL != url || output.Profile.Presence != "full_presenter" || output.Profile.Gaze != "目光聚焦镜头" {
		t.Fatalf("model changed the source identity or observations disappeared: %+v", output.Profile)
	}
	if len(output.Beats) != 1 || output.Beats[0].Action != "举手后回落" || output.Beats[0].Expression != "抬眼后浅笑" {
		t.Fatal("static image analysis overwrote timed source performance", output.Beats)
	}
}

func TestPlanPersonaImageReadRejectsCrossWorkspaceAndInvalidImages(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	url, err := storeAssetCreationBytes(t.Context(), assetGridFixture(t, 300, 400), "persona", "owner")
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{url, "file:///etc/passwd", "http://127.0.0.1:1/image.jpg", "data:image/png;base64,bm90LWFuLWltYWdl"} {
		if _, err := planPersonaContent(t.Context(), "other", planAdaptRequest{PersonaReferenceImageURL: source}, "facts"); err == nil {
			t.Fatalf("unsafe or invalid persona image accepted: %s", source)
		}
	}
}

func TestPlanPersonaVisualRequiresObservedFieldsAndNeverInventsAnUnboundProfile(t *testing.T) {
	body := planAdaptRequest{PersonaReferenceImageURL: "/storage/local/main.jpg", PersonaPresence: "hands_only"}
	for _, text := range []string{`{}`, `{"personaVisualProfile":null}`, `{"personaVisualProfile":{"temperament":42}}`,
		`{"personaVisualProfile":{"limitations":"看不清"}}`, `{"personaVisualProfile":{"gaze":"` + strings.Repeat("长", 601) + `"}}`} {
		if _, err := parsePlanPersonaVisual(scriptCompletion(text, "stop"), body); err == nil {
			t.Fatal("missing or invalid visual profile accepted", text)
		}
	}
	if profile, err := parsePlanPersonaVisual(scriptCompletion(`{"personaVisualProfile":{"gaze":"虚构的观察"}}`, "stop"), planAdaptRequest{}); err != nil || profile != nil {
		t.Fatal("unbound visual profile must be discarded", profile, err)
	}
	if err := validatePlanPersonaInput(&planAdaptRequest{PersonaReferenceImageURL: body.PersonaReferenceImageURL, PersonaPresence: "none"}); err == nil {
		t.Fatal("product-only request may not attach a persona")
	}
	content, err := planPersonaContent(t.Context(), "local", planAdaptRequest{}, "legacy facts")
	if err != nil || content != "legacy facts" {
		t.Fatal("legacy text-only requests changed", content, err)
	}
}

func TestPlanPersonaVisualHandsOnlyDiscardsFacialObservations(t *testing.T) {
	body := planAdaptRequest{PersonaReferenceImageURL: "/storage/local/main.jpg", PersonaPresence: "hands_only"}
	profile, err := parsePlanPersonaVisual(scriptCompletion(`{"personaVisualProfile":{"temperament":"手部放松","gaze":"注视镜头","expression":"微笑","posture":"手指舒展"}}`, "stop"), body)
	if err != nil || profile.Gaze != "" || profile.Expression != "" || profile.Posture != "手指舒展" {
		t.Fatal("hands-only analysis leaked a face", profile, err)
	}
}
