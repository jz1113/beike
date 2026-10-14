package system

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGatewayUserRequiresIdentity(t *testing.T) {
	handler := gatewayUserHandler()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/gateway-user", bytes.NewBufferString(`{"systemToken":"token"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少用户 ID") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestFetchGatewayUserReadsQuota(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/user/self" || r.Header.Get("New-API-User") != "7" || r.Header.Get("Authorization") != "Bearer token" {
			t.Errorf("request %s %s", r.URL.Path, r.Header.Get("New-API-User"))
		}
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":7,"username":"贝壳","quota":500000,"used_quota":0,"request_count":3,"group":"vip"}}`))
	}))
	defer server.Close()
	status, body := fetchGatewayUser(context.Background(), server.Client(), server.URL, "7", "token", "Asia/Shanghai")
	user, _ := body["user"].(map[string]any)
	if status != http.StatusOK || user["username"] != "贝壳" || user["quotaFormatted"] != 1.0 || user["quotaRmb"] != 1.2 {
		t.Fatalf("status %d body %#v", status, body)
	}
}
