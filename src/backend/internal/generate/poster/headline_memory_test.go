package poster

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/platform/database"

	_ "modernc.org/sqlite"
)

func TestCoverMemoryMigrationAndEntryFlow(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	var tables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('CoverMemorySample','CoverMemoryEntry','CoverMemoryUsage')`).Scan(&tables); err != nil || tables != 3 {
		t.Fatalf("tables %d %v", tables, err)
	}
	_ = db.Close()

	create := httptest.NewRecorder()
	HeadlineMemoryCorrection(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/generate/headline-memory/corrections", strings.NewReader(`{"rule":"标题不要再盖住品牌"}`)))
	if create.Code != http.StatusOK {
		t.Fatalf("create %d %s", create.Code, create.Body.String())
	}
	var created struct {
		Entry coverEntry `json:"entry"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil || created.Entry.Status != "adopted" || created.Entry.Branch != "correction" {
		t.Fatalf("entry %v %s", err, create.Body.String())
	}

	list := httptest.NewRecorder()
	HeadlineMemory(cfg).ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/api/generate/headline-memory", nil))
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "标题不要再盖住品牌") {
		t.Fatalf("list %d %s", list.Code, list.Body.String())
	}

	patch := httptest.NewRequest(http.MethodPatch, "/api/generate/headline-memory/entries/"+created.Entry.ID, strings.NewReader(`{"status":"trashed"}`))
	patch.SetPathValue("id", created.Entry.ID)
	trashed := httptest.NewRecorder()
	HeadlineMemoryEntry(cfg).ServeHTTP(trashed, patch)
	if trashed.Code != http.StatusOK {
		t.Fatalf("trash %d %s", trashed.Code, trashed.Body.String())
	}
	cleared := httptest.NewRecorder()
	HeadlineMemoryTrash(cfg).ServeHTTP(cleared, httptest.NewRequest(http.MethodDelete, "/api/generate/headline-memory/trash", nil))
	if cleared.Code != http.StatusOK {
		t.Fatalf("clear %d %s", cleared.Code, cleared.Body.String())
	}
	after := httptest.NewRecorder()
	HeadlineMemory(cfg).ServeHTTP(after, httptest.NewRequest(http.MethodGet, "/api/generate/headline-memory", nil))
	if strings.Contains(after.Body.String(), created.Entry.ID) {
		t.Fatalf("still present %s", after.Body.String())
	}
}

func TestEntriesFromDeconstruction(t *testing.T) {
	parsed := map[string]any{
		"layout":     map[string]any{"rule": "标题压住商品上沿", "evidence": "顶部两行"},
		"typeface":   map[string]any{"rule": "超粗黑体两行", "evidence": "主标题"},
		"textColor":  map[string]any{"rule": "近黑字压在米白底上", "evidence": "字与底"},
		"background": map[string]any{"rule": "米白纸纹，左上柔光", "evidence": "背景"},
		"subject":    map[string]any{"rule": "台灯居中，灯头不挡字", "evidence": "中部"},
		"harmony":    map[string]any{"rule": "米白、近黑、暖铜三色", "evidence": "灯座"},
		"variation":  map[string]any{"rule": "这一张取纸感", "evidence": "整张"},
	}
	parsed["subject"] = map[string]any{"observation": "右下角有一枚手绘星星", "method": "保留右下角手绘星星", "uncertainty": "看不清星星是否描边"}
	entries := entriesFromDeconstruction("sample_1", parsed)
	if len(entries) != 6 {
		t.Fatalf("entries %d", len(entries))
	}
	subject := entries[4]
	if subject.Branch != "subject" || subject.Rule != "保留右下角手绘星星" || !strings.Contains(subject.Evidence, "手绘星星") || !strings.Contains(subject.Evidence, "不确定：看不清星星是否描边") {
		t.Fatalf("unique trait %#v", subject)
	}
	if entries[0].Branch != "layout" || entries[0].Evidence != "顶部两行" || entries[0].Status != "pending" {
		t.Fatalf("layout %#v", entries[0])
	}
	if entries[5].Branch != "color" || entries[5].Rule != "米白、近黑、暖铜三色" {
		t.Fatalf("harmony %#v", entries[5])
	}
}

func TestHeadlineDesignInjectsAdoptedMemory(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	ctx := t.Context()
	if err := insertCoverEntries(ctx, db, "local", []coverEntry{
		{ID: "layout_1", Branch: "layout", Rule: "商品居中并压住上沿", Status: "adopted", Source: "sample"},
		{ID: "fix_1", Branch: "correction", Rule: "不要再使用紫蓝渐变", Status: "adopted", Source: "correction"},
		{ID: "wait_1", Branch: "background", Rule: "待确认的纸纹不要注入", Status: "pending", Source: "sample"},
	}); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "",
		"composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面",
		"layout": "居中压顶", "typeface": "超粗黑体两行", "textColor": "近黑字压在米白底上",
		"background": "米白纸纹，左上柔光", "subject": "台灯居中，灯头不挡字",
		"harmony": "米白、近黑、灯的暖铜三色", "variation": "相对上一张改成纸感",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(plan)}}}})
	var seen string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		seen = string(raw)
		_, _ = w.Write(body)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })

	response := httptest.NewRecorder()
	request := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"originalTitle":"台灯","coverTitle":"台灯","batchId":"batch_1","itemId":"item_1","itemTitle":"台灯很好用","previousDesign":"上一张是深底黄字","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"` + server.URL + `"}`
	HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: cfg.DatabaseURL}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(request)))
	if response.Code != http.StatusOK {
		t.Fatalf("design %d %s", response.Code, response.Body.String())
	}
	correctionAt := strings.Index(seen, "不要再使用紫蓝渐变")
	layoutAt := strings.Index(seen, "商品居中并压住上沿")
	if correctionAt < 0 || layoutAt < 0 || correctionAt > layoutAt {
		t.Fatalf("prompt order correction=%d layout=%d body=%s", correctionAt, layoutAt, seen)
	}
	if strings.Contains(seen, "待确认的纸纹不要注入") {
		t.Fatalf("pending memory leaked %s", seen)
	}
	if !strings.Contains(seen, "上一张是深底黄字") {
		t.Fatalf("previous missing %s", seen)
	}

	read, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer read.Close()
	var uses int
	var design string
	if err := read.QueryRow(`SELECT "useCount" FROM "CoverMemoryEntry" WHERE "id"='fix_1'`).Scan(&uses); err != nil || uses != 1 {
		t.Fatalf("uses %d %v", uses, err)
	}
	if err := read.QueryRow(`SELECT "design" FROM "CoverMemoryUsage" WHERE "itemId"='item_1'`).Scan(&design); err != nil || !strings.Contains(design, "居中压顶") {
		t.Fatalf("usage %v %s", err, design)
	}
}

func TestHeadlineDeconstructStoresPendingEntries(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	parsed := map[string]any{
		"layout":  map[string]any{"rule": "标题压住商品上沿", "evidence": "顶部"},
		"summary": "纸感封面",
	}
	payload, _ := json.Marshal(parsed)
	body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(payload)}}}})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(body)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })

	response := httptest.NewRecorder()
	request := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"title":"纸感样张","model":"gemini-3.7-flash","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"` + server.URL + `"}`
	HeadlineDeconstruct(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: cfg.DatabaseURL}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-deconstruct", strings.NewReader(request)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "标题压住商品上沿") {
		t.Fatalf("deconstruct %d %s", response.Code, response.Body.String())
	}
	read, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer read.Close()
	var status, rule string
	if err := read.QueryRow(`SELECT "status" FROM "CoverMemorySample"`).Scan(&status); err != nil || status != "completed" {
		t.Fatalf("sample %s %v", status, err)
	}
	if err := read.QueryRow(`SELECT "rule" FROM "CoverMemoryEntry" WHERE "status"='pending'`).Scan(&rule); err != nil || rule != "标题压住商品上沿" {
		t.Fatalf("entry %s %v", rule, err)
	}
}

func TestDesignUsesOnlyRequestedSample(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	ctx := t.Context()
	if err := insertCoverEntries(ctx, db, "local", []coverEntry{
		{ID: "old_layout", Branch: "layout", Rule: "旧样张使用深色满版", SampleID: "sample_old", Status: "adopted", Source: "sample"},
		{ID: "new_layout", Branch: "layout", Rule: "新样张把标题放在左下", SampleID: "sample_new", Status: "adopted", Source: "sample"},
		{ID: "fix_only", Branch: "correction", Rule: "不要挡住镜头", Status: "adopted", Source: "correction"},
		{ID: "pending_new", Branch: "background", Rule: "待确认的网格不要注入", SampleID: "sample_new", Status: "pending", Source: "sample"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE "CoverMemoryEntry" SET "createdAt"='2020-01-01T00:00:00Z' WHERE "id"='old_layout'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE "CoverMemoryEntry" SET "createdAt"='2024-01-01T00:00:00Z' WHERE "id"='new_layout'`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "",
		"composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面",
		"layout": "左下标题", "typeface": "超粗黑体", "textColor": "白字",
		"background": "浅灰", "subject": "台灯", "harmony": "灰白黑", "variation": "改了位置",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(plan)}}}})
	var seen string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		seen = string(raw)
		_, _ = w.Write(body)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: cfg.DatabaseURL})
	request := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"originalTitle":"台灯","coverTitle":"台灯","memorySampleId":"sample_old","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"` + server.URL + `"}`
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(request)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"memorySampleId":"sample_old"`) {
		t.Fatalf("design %d %s", response.Code, response.Body.String())
	}
	if !strings.Contains(seen, "旧样张使用深色满版") || strings.Contains(seen, "新样张把标题放在左下") || strings.Contains(seen, "待确认的网格不要注入") || !strings.Contains(seen, "不要挡住镜头") {
		t.Fatal(seen)
	}
	read, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer read.Close()
	var oldUses, newUses int
	if err := read.QueryRow(`SELECT "useCount" FROM "CoverMemoryEntry" WHERE "id"='old_layout'`).Scan(&oldUses); err != nil || oldUses != 1 {
		t.Fatalf("old uses %d %v", oldUses, err)
	}
	if err := read.QueryRow(`SELECT "useCount" FROM "CoverMemoryEntry" WHERE "id"='new_layout'`).Scan(&newUses); err != nil || newUses != 0 {
		t.Fatalf("new uses %d %v", newUses, err)
	}
	missed := httptest.NewRecorder()
	handler.ServeHTTP(missed, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"originalTitle":"台灯","coverTitle":"台灯","memorySampleId":"missing","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if missed.Code != http.StatusBadRequest || !strings.Contains(missed.Body.String(), "所选样张没有已采纳的特点") {
		t.Fatalf("missing %d %s", missed.Code, missed.Body.String())
	}
}

func TestHeadlineDeconstructReasoningEffort(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	var calls atomic.Int32
	var firstEffort atomic.Bool
	var defaultEffort atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		body, _ := io.ReadAll(r.Body)
		var sent map[string]any
		if json.Unmarshal(body, &sent) != nil {
			t.Errorf("upstream body %s", body)
		}
		if _, leaked := sent["reasoning_effort"]; leaked {
			t.Errorf("raw effort leaked %s", body)
		}
		effort, _ := sent["output_config"].(map[string]any)
		thinking, _ := sent["thinking"].(map[string]any)
		if n == 1 {
			firstEffort.Store(effort["effort"] == "high" && thinking["type"] == "adaptive")
		}
		if n == 2 && effort["effort"] != nil {
			defaultEffort.Store(true)
		}
		reply := `{"layout":{"rule":"标题压住商品上沿","evidence":"顶部两行"}}`
		_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": reply}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 2}})
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })

	handler := HeadlineDeconstruct(cfg)
	post := func(effort string) *httptest.ResponseRecorder {
		body := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"title":"纸感样张","model":"claude-haiku-5-5","textProtocol":"anthropic","customApiKey":"secret","customBaseUrl":"` + server.URL + `"`
		if effort != "" {
			body += `,"reasoningEffort":"` + effort + `"`
		}
		body += `}`
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/generate/headline-deconstruct", strings.NewReader(body)))
		return rec
	}
	accepted := post("high")
	if accepted.Code != http.StatusOK || !firstEffort.Load() || calls.Load() != 1 {
		t.Fatalf("accepted %d calls %d effort %v body %s", accepted.Code, calls.Load(), firstEffort.Load(), accepted.Body.String())
	}
	omitted := post("")
	if omitted.Code != http.StatusOK || calls.Load() != 2 || defaultEffort.Load() {
		t.Fatalf("default %d calls %d leaked %v body %s", omitted.Code, calls.Load(), defaultEffort.Load(), omitted.Body.String())
	}

	rejected := httptest.NewRecorder()
	handler.ServeHTTP(rejected, httptest.NewRequest(http.MethodPost, "/api/generate/headline-deconstruct", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"model":"claude-haiku-5-5","reasoningEffort":"extreme","textProtocol":"anthropic","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if rejected.Code != http.StatusBadRequest || !strings.Contains(rejected.Body.String(), "不支持的思考强度") || calls.Load() != 2 {
		t.Fatalf("rejected %d calls %d body %s", rejected.Code, calls.Load(), rejected.Body.String())
	}
}

func coverMemoryConfig(t *testing.T) config.Config {
	t.Helper()
	path := filepath.Join(t.TempDir(), "cover.db")
	cfg := config.Config{DatabaseURL: "file:" + path, NodeEnv: "development"}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, name := range []string{"cover_memory.sql", "cover_learning.sql"} {
		raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	return cfg
}
