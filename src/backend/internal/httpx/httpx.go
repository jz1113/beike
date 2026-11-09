// Package httpx holds HTTP helpers shared by domain handlers.
package httpx

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
)

type workspaceIDKey struct{}

const (
	localWorkspace     = "local"
	minWorkspaceSecret = 32
)

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func WithWorkspace(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, workspaceIDKey{}, id)
}

func WorkspaceFrom(r *http.Request) string {
	if value, ok := r.Context().Value(workspaceIDKey{}).(string); ok && value != "" {
		return value
	}
	return localWorkspace
}

func QueryInt(r *http.Request, name string, fallback int) int {
	parsed, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return fallback
	}
	return parsed
}

func Authorized(r *http.Request, cfg config.Config) bool {
	if cfg.AccessToken == "" {
		return false
	}
	token := RequestToken(r)
	if token == "" {
		return false
	}
	if same(token, cfg.AccessToken) || (cfg.AdminToken != "" && same(token, cfg.AdminToken)) {
		return true
	}
	return !cfg.Production() && same(token, "azhuo-local-dev")
}

func RequestToken(r *http.Request) string {
	if token := strings.TrimSpace(r.Header.Get("x-app-token")); token != "" {
		return token
	}
	if token := strings.TrimSpace(r.Header.Get("x-access-token")); token != "" {
		return token
	}
	if auth := r.Header.Get("Authorization"); len(auth) > 7 && strings.EqualFold(auth[:7], "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	for _, part := range strings.Split(r.Header.Get("Cookie"), ";") {
		part = strings.TrimSpace(part)
		name, value, ok := strings.Cut(part, "=")
		if ok && name == "app_token" {
			decoded, err := url.QueryUnescape(value)
			if err != nil {
				return ""
			}
			return decoded
		}
	}
	return ""
}

func TokenMatches(got, want string) bool {
	if want == "" {
		return false
	}
	return same(got, want)
}

func same(left, right string) bool {
	a := sha256.Sum256([]byte(left))
	b := sha256.Sum256([]byte(right))
	return subtle.ConstantTimeCompare(a[:], b[:]) == 1
}

func MediaSession(r *http.Request, cfg config.Config) *mediasign.Signature {
	if !Authorized(r, cfg) || cfg.AccessToken == "" {
		return nil
	}
	signature := mediasign.Create("proxy-media-session", cfg.AccessToken, 3600)
	return &signature
}

func ResolveWorkspace(r *http.Request, cfg config.Config) (string, bool) {
	if !cfg.Production() {
		return localWorkspace, true
	}
	secret := strings.TrimSpace(r.Header.Get("x-workspace-token"))
	if secret == "" {
		secret = cookieValue(r, "beike_workspace")
	}
	if len(secret) < minWorkspaceSecret {
		return "", false
	}
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:]), true
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func RequestID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "request"
	}
	return hex.EncodeToString(buf[:])
}
