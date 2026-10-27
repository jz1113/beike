package keywords

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestKeywordReviewAcceptsContractSizedChineseBatch(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	rows := make([]any, 60)
	for index := range rows {
		rows[index] = map[string]any{"id": string(rune('a' + index)), "query": "猫砂",
			"expansion": strings.Repeat("词", 4000), "entityExpansion": strings.Repeat("词", 4000)}
	}
	body, err := json.Marshal(map[string]any{"rows": rows, "rulesVersion": 0,
		"customBaseUrl": "https://api.deepseek.com", "customApiKey": "test-only"})
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 1<<20 {
		t.Fatal("fixture must exceed the former 1 MB limit")
	}
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 429, Header: http.Header{}, Body: http.NoBody}, nil
	})}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(string(body)))
	got := executeKeywordReview(config.Config{}, request, client)
	if got.status != 429 || calls != 1 {
		t.Fatalf("legal batch rejected before model: status=%d calls=%d body=%#v", got.status, calls, got.body)
	}
}

func TestKeywordReviewFindsFrozenVersionOutsideRecentHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "KeywordReviewRuleRevision" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "version" INTEGER NOT NULL,
		"entriesJson" TEXT NOT NULL, "note" TEXT NOT NULL, "createdAt" TEXT NOT NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", nil)
	workspace := httpx.WorkspaceFrom(request)
	for base := 0; base < 32; base++ {
		_, err = database.PublishKeywordRules(context.Background(), db, workspace, base,
			[]database.RuleEntry{{Section: "其他说明", Text: "保留最初审核口径"}}, "发布规则")
		if err != nil {
			t.Fatal(err)
		}
	}
	version := 1
	rules, status, body := loadKeywordRules(config.Config{DatabaseURL: "file:" + path}, request, &version)
	if body != nil || status != 0 || len(rules) != 1 || rules[0].Text != "保留最初审核口径" {
		t.Fatalf("frozen version lost: status=%d rules=%#v body=%#v", status, rules, body)
	}
	version = 99
	_, status, _ = loadKeywordRules(config.Config{DatabaseURL: "file:" + path}, request, &version)
	if status != http.StatusConflict {
		t.Fatalf("missing version status=%d", status)
	}
	version = 1
	other := request.WithContext(httpx.WithWorkspace(request.Context(), "another-workspace"))
	_, status, _ = loadKeywordRules(config.Config{DatabaseURL: "file:" + path}, other, &version)
	if status != http.StatusConflict {
		t.Fatalf("another workspace accessed frozen rule: status=%d", status)
	}
}

func TestKeywordReviewRejectsOversizedRequestBeforeDispatch(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(strings.Repeat(" ", (4<<20)+1)))
	got := executeKeywordReview(config.Config{}, request, nil)
	if got.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d body=%#v", got.status, got.body)
	}
}
