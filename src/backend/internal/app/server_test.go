package app

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestHealthOmitsMediaSessionWithoutToken(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d", response.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != true || body["ok"] != true || body["mediaSession"] != nil {
		t.Fatalf("body %#v", body)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("health 响应必须禁止缓存")
	}
}

func TestSystemConfigPostRequiresToken(t *testing.T) {
	handler := New(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	handler = New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	request := httptest.NewRequest(http.MethodPost, "/api/system/config", strings.NewReader(`{}`))
	request.Header.Set("x-app-token", "secret")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 AI API Key") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestNativeSystemRouteRequiresToken(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/models/pricing", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestPetRoutesAreRegistered(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	list := httptest.NewRequest(http.MethodGet, "/api/pets", nil)
	list.Header.Set("x-app-token", "secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, list)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "接口不存在") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	importRequest := httptest.NewRequest(http.MethodPost, "/api/pets/import", strings.NewReader(`{"commands":"not-a-command"}`))
	importRequest.Header.Set("x-app-token", "secret")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, importRequest)
	if response.Code == http.StatusNotFound || strings.Contains(response.Body.String(), "接口不存在") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestUnknownAPIIsJSON(t *testing.T) {
	handler := New(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/not-registered", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status %d", response.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != false || body["error"] != "接口不存在" {
		t.Fatalf("body %#v", body)
	}
}

func TestRetiredStudioRoutesAreNotServed(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	for _, pattern := range []string{
		"GET /api/avatar/characters", "POST /api/avatar/characters", "DELETE /api/avatar/characters/example",
		"GET /api/avatar/voices", "POST /api/avatar/voices", "DELETE /api/avatar/voices/example",
		"GET /api/avatar/fonts", "GET /api/avatar/tasks", "GET /api/avatar/tasks/example",
		"DELETE /api/avatar/tasks/example", "POST /api/avatar/render",
		"POST /api/generate/ppt-outline", "POST /api/generate/ppt-detail",
		"POST /api/generate/ppt-slide", "POST /api/generate/ppt-narration",
		"POST /api/generate/video-sales/analyze", "POST /api/generate/video-sales/script",
		"POST /api/generate/video-sales/select-images", "POST /api/generate/video-sales/finalize-prompts",
		"POST /api/generate/video-sales/compose", "POST /api/generate/video-sales/transcode",
	} {
		t.Run(pattern, func(t *testing.T) {
			method, path, _ := strings.Cut(pattern, " ")
			request := httptest.NewRequest(method, path, nil)
			request.Header.Set("x-app-token", "secret")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), "接口不存在") {
				t.Fatalf("status %d body %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestProductionDerivedCacheRequiresAdmin(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	dir := filepath.Join(root, "derived")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dir, "marker")
	if err := os.WriteFile(marker, []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AccessToken: "app", AdminToken: "admin", NodeEnv: "production"})
	for _, tc := range []struct {
		token, workspace string
		status           int
	}{
		{"", strings.Repeat("a", 32), http.StatusUnauthorized},
		{"admin", "", http.StatusUnauthorized},
		{"app", strings.Repeat("a", 32), http.StatusForbidden},
		{"app", strings.Repeat("b", 32), http.StatusForbidden},
		{"admin", strings.Repeat("a", 32), http.StatusOK},
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/system/local-storage/clear-derived", nil)
		req.Header.Set("x-app-token", tc.token)
		req.Header.Set("x-workspace-token", tc.workspace)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != tc.status {
			t.Fatalf("token %q: status %d, want %d", tc.token, rec.Code, tc.status)
		}
		_, err := os.Stat(marker)
		if tc.status == http.StatusOK && !os.IsNotExist(err) || tc.status != http.StatusOK && err != nil {
			t.Fatalf("marker after status %d: %v", rec.Code, err)
		}
	}
}

func TestSystemConfigPostRejectsInvalidPayload(t *testing.T) {
	handler := New(config.Config{AccessToken: "app", NodeEnv: "production"})
	for _, body := range []string{"{", "null", "[]", `{}{}`} {
		req := httptest.NewRequest(http.MethodPost, "/api/system/config", strings.NewReader(body))
		req.Header.Set("x-app-token", "app")
		req.Header.Set("x-workspace-token", strings.Repeat("a", 32))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "请求数据格式异常") {
			t.Fatalf("payload %q: status %d body %s", body, rec.Code, rec.Body.String())
		}
	}
}

func TestProductionIndexCookieRequiresTrustedEntryAndSetsHttpOnlySecure(t *testing.T) {
	dist := t.TempDir()
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>ok</html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AccessToken: "prod-secret", NodeEnv: "production", WebDistDir: dist})

	untrusted := httptest.NewRequest(http.MethodGet, "/", nil)
	untrusted.RemoteAddr = "203.0.113.10:54321"
	recUntrusted := httptest.NewRecorder()
	handler.ServeHTTP(recUntrusted, untrusted)
	if len(recUntrusted.Result().Cookies()) != 0 {
		t.Fatalf("expected no app_token cookie for untrusted public request, got %+v", recUntrusted.Result().Cookies())
	}

	proxiedNoAuth := httptest.NewRequest(http.MethodGet, "/", nil)
	proxiedNoAuth.RemoteAddr = "127.0.0.1:43210"
	proxiedNoAuth.Header.Set("X-Forwarded-For", "203.0.113.10")
	proxiedNoAuth.Header.Set("Authorization", "Basic spoofed")
	recProxiedNoAuth := httptest.NewRecorder()
	handler.ServeHTTP(recProxiedNoAuth, proxiedNoAuth)
	if len(recProxiedNoAuth.Result().Cookies()) != 0 {
		t.Fatalf("expected no app_token cookie for unauthenticated proxied request, got %+v", recProxiedNoAuth.Result().Cookies())
	}

	proxiedBasicAuth := httptest.NewRequest(http.MethodGet, "/", nil)
	proxiedBasicAuth.RemoteAddr = "127.0.0.1:43210"
	proxiedBasicAuth.Header.Set("X-Forwarded-For", "203.0.113.10")
	proxiedBasicAuth.Header.Set("X-Forwarded-Proto", "https")
	proxiedBasicAuth.Header.Set("X-Beike-Web-User", "beike")
	recTrusted := httptest.NewRecorder()
	handler.ServeHTTP(recTrusted, proxiedBasicAuth)
	cookies := recTrusted.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "app_token" || !cookies[0].HttpOnly || !cookies[0].Secure {
		t.Fatalf("expected HttpOnly+Secure app_token cookie on authenticated entry, got %+v", cookies)
	}
}

func TestPublicWebSessionKeepsWorkspaceProtection(t *testing.T) {
	dist := t.TempDir()
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>ok</html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := New(config.Config{AccessToken: "prod-secret", NodeEnv: "production", WebDistDir: dist, PublicWeb: true})
	index := httptest.NewRecorder()
	handler.ServeHTTP(index, httptest.NewRequest(http.MethodGet, "https://example.test/", nil))
	cookies := index.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "beike_public_session" || cookies[0].Value == "prod-secret" || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatalf("expected a signed Secure HttpOnly public session, got %+v", cookies)
	}

	for _, tc := range []struct {
		name, cookie, workspace string
		want                    int
	}{
		{"no session", "", strings.Repeat("w", 32), http.StatusUnauthorized},
		{"tampered session", cookies[0].Value + "x", strings.Repeat("w", 32), http.StatusUnauthorized},
		{"no workspace", cookies[0].Value, "", http.StatusUnauthorized},
		{"valid session and workspace", cookies[0].Value, strings.Repeat("w", 32), http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/system/models/pricing", nil)
			req.AddCookie(&http.Cookie{Name: cookies[0].Name, Value: tc.cookie})
			req.Header.Set("x-workspace-token", tc.workspace)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("got HTTP %d, want %d", rec.Code, tc.want)
			}
		})
	}
}

func TestAssetViewGridRouteRequiresAuthAndValidInput(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	for _, authenticated := range []bool{false, true} {
		request := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-grid", strings.NewReader(`{}`))
		want := http.StatusUnauthorized
		if authenticated {
			request.Header.Set("x-app-token", "secret")
			want = http.StatusBadRequest
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != want {
			t.Fatalf("authenticated=%v status=%d want=%d body=%s", authenticated, response.Code, want, response.Body.String())
		}
	}
}

func TestLibraryPutRouteIsNative(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/assets/library", bytes.NewBufferString(`{}`))
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestNativeRoutesAreInOpenAPI(t *testing.T) {
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "src/shared/contracts/openapi.yaml")); statErr == nil {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("找不到 src/shared/contracts/openapi.yaml")
		}
		dir = parent
	}
	raw, err := os.ReadFile(filepath.Join(dir, "src/shared/contracts/openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	spec := string(raw)
	for _, pattern := range NativePatterns() {
		method, path, ok := strings.Cut(pattern, " ")
		if !ok {
			t.Fatalf("路由格式不正确: %s", pattern)
		}
		quoted := "  '" + path + "':"
		plain := "  " + path + ":"
		index := strings.Index(spec, quoted)
		if index < 0 {
			index = strings.Index(spec, plain)
		}
		if index < 0 {
			t.Errorf("OpenAPI 缺少 %s", path)
			continue
		}
		section := spec[index:]
		if next := strings.Index(section[1:], "\n  /"); next >= 0 {
			section = section[:next+1]
		}
		if !strings.Contains(section, "\n    "+strings.ToLower(method)+":") {
			t.Errorf("OpenAPI 的 %s 缺少 %s", path, method)
		}
	}
}

func TestProductionWorkspaceIsolationAtHTTPBoundary(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..")
	path := filepath.Join(t.TempDir(), "workspace.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	workspaceA, workspaceB := strings.Repeat("a", 32), strings.Repeat("b", 32)
	cfg := config.Config{NodeEnv: "production", AccessToken: "browser-fixture", DatabaseURL: "file:" + path}
	handler := New(cfg)
	send := func(method, path, workspace, body string, want int) string {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("x-app-token", cfg.AccessToken)
		req.Header.Set("x-workspace-token", workspace)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s %s: status %d, want %d, body %s", method, path, rec.Code, want, rec.Body)
		}
		return rec.Body.String()
	}

	const products = "/api/sales/products"
	send(http.MethodGet, products, "", "", http.StatusUnauthorized)
	body := send(http.MethodPost, products, workspaceA, `{"title":"workspace A product"}`, http.StatusOK)
	var created struct {
		Item struct{ ID string }
	}
	if err := json.Unmarshal([]byte(body), &created); err != nil || created.Item.ID == "" {
		t.Fatalf("product response: %s (%v)", body, err)
	}
	product := products + "/" + created.Item.ID
	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete} {
		send(method, product, workspaceB, `{"title":"foreign update"}`, http.StatusNotFound)
	}
	if got := send(http.MethodGet, product, workspaceA, "", http.StatusOK); !strings.Contains(got, "workspace A product") {
		t.Fatal(got)
	}

	const sessions = "/api/assistant/sessions"
	send(http.MethodPut, sessions, workspaceA, `{"sessions":[{"id":"scope-test","title":"workspace A conversation","messages":[]}]}`, http.StatusOK)
	if got := send(http.MethodGet, sessions, workspaceA, "", http.StatusOK); !strings.Contains(got, "workspace A conversation") {
		t.Fatal(got)
	}
	if got := send(http.MethodGet, sessions, workspaceB, "", http.StatusOK); !strings.Contains(got, `"sessions":[]`) {
		t.Fatal(got)
	}

	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","description","lighting","updatedAt") VALUES
		('guest-visible-scene','official','Public fixture','','',CURRENT_TIMESTAMP),
		('guest-private-scene',?,'Private fixture','','',CURRENT_TIMESTAMP)`, fmt.Sprintf("%x", sha256.Sum256([]byte(workspaceA)))); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/sales/studio-assets", "/api/catalog/assets/library?type=all&slim=1"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("X-Workspace-Token", workspaceA)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if body := rec.Body.String(); rec.Code != 200 || !strings.Contains(body, "guest-visible-scene") || strings.Contains(body, "guest-private-scene") {
			t.Fatalf("public catalog %s leaked data or failed, status %d", path, rec.Code)
		}
	}
	const draftID = "00000000-0000-4000-8000-000000000001"
	const graph = `{"title":"workspace A draft","nodes":[{"id":"text","type":"text-node","title":"Draft","text":"Fixture"}],"edges":[]}`
	if _, err := db.Exec(`INSERT INTO canvas_drafts (workspace,id,revision,graph,prompt_changes,created_at,updated_at)
		VALUES (?,?,1,?,'[]',1,1)`, fmt.Sprintf("%x", sha256.Sum256([]byte(workspaceA))), draftID, graph); err != nil {
		t.Fatal(err)
	}
	draft := "/api/canvas/drafts/" + draftID
	if got := send(http.MethodGet, draft, workspaceA, "", http.StatusOK); !strings.Contains(got, "workspace A draft") {
		t.Fatal(got)
	}
	send(http.MethodGet, draft, workspaceB, "", http.StatusNotFound)
}

func TestPublicCatalogKeepsPrivateReadsAndWritesProtected(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "production"})
	for _, test := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/api/catalog/skills", 200},
		{"GET", "/api/sales/scripts", 200},
		{"GET", "/api/sales/asset-view-jobs", 200},
		{"GET", "/api/library/preferences", 200},
		{"GET", "/api/catalog/assets/library?type=all&export=1", 401},
		{"GET", "/api/assistant/sessions", 401},
		{"POST", "/api/catalog/skills", 401},
		{"POST", "/api/catalog/assets/library", 401},
		{"PATCH", "/api/library/preferences", 401},
	} {
		req := httptest.NewRequest(test.method, test.path, nil)
		req.Header.Set("X-Workspace-Token", "anonymous-cannot-select-a-private-workspace")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != test.status {
			t.Errorf("%s %s: got %d, want %d", test.method, test.path, rec.Code, test.status)
		}
	}
}
