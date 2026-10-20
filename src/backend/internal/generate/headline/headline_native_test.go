package headline

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestHeadlineHTTPNativeProtocolPropagation(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "",
		"composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面",
		"layout": "居中压顶", "typeface": "超粗黑体两行", "textColor": "近黑字压在米白底上",
		"background": "米白纸纹，左上柔光", "subject": "台灯居中，灯头不挡字",
		"harmony": "米白、近黑、灯的暖铜三色", "variation": "第一张，取纸感编辑",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	for _, tc := range []struct {
		name, reply string
		handler     http.Handler
	}{
		{"title", `{"title":"台灯到底值不值"}`, HeadlineTitle(cfg)},
		{"design", string(plan), HeadlineDesign(cfg)},
		{"deconstruct", `{"layout":{"rule":"标题压住商品上沿","evidence":"顶部两行"}}`, HeadlineDeconstruct(cfg)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "cover-key" {
					t.Errorf("native request %s", r.URL.Path)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": tc.reply}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 2}})
			}))
			defer server.Close()
			previous := generate.ModelHTTP
			generate.ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { generate.ModelHTTP = previous }()
			post := func(protocol string) *httptest.ResponseRecorder {
				body := `{"model":"shared-vision","originalTitle":"台灯测评","coverTitle":"台灯","imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"textProtocol":` + protocol + `,"customBaseUrl":"` + server.URL + `","customApiKey":"cover-key"}`
				r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
				r.Header.Set("x-text-protocol", "gemini")
				rec := httptest.NewRecorder()
				tc.handler.ServeHTTP(rec, r)
				return rec
			}
			rec := post(`"anthropic"`)
			if rec.Code != 200 || calls.Load() != 1 || !strings.Contains(rec.Body.String(), `"totalTokens":3`) {
				t.Fatalf("status %d calls %d body %s", rec.Code, calls.Load(), rec.Body.String())
			}
			for _, protocol := range []string{`null`, `42`, `"invalid"`} {
				rec = post(protocol)
				if rec.Code != 400 || !strings.Contains(rec.Body.String(), "textProtocol") || calls.Load() != 1 {
					t.Fatalf("invalid protocol status %d calls %d body %s", rec.Code, calls.Load(), rec.Body.String())
				}
			}
		})
	}
}
