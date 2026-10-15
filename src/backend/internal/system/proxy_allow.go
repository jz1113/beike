package system

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/network"
)

var proxySuffixes struct {
	sync.Mutex
	root   string
	values []string
}

func RemoteHostAllowed(cfg config.Config, host string) bool {
	return proxyHostAllowed(cfg, host)
}

func proxyHostAllowed(cfg config.Config, host string) bool {
	host = strings.ToLower(strings.Trim(strings.TrimSuffix(host, "."), "[]"))
	if host == "" {
		return false
	}
	if !cfg.Production() {
		if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" || strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "10.") || strings.HasPrefix(host, "172.") {
			return true
		}
	}
	if network.PrivateIP(host) {
		return false
	}
	for _, suffix := range configuredProxyHosts() {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	for _, suffix := range loadProxySuffixes(cfg.Root) {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func configuredProxyHosts() []string {
	hosts := []string{}
	for _, key := range []string{
		"S3_PUBLIC_DOMAIN", "S3_ENDPOINT", "R2_PUBLIC_DOMAIN",
		"AI_DRAWING_BASE_URL", "AI_DRAWING_API_BASE_URL", "AI_API_BASE", "AI_BASE_URL", "AI_GATEWAY_URL",
		"OPENAI_BASE_URL", "OPENAI_API_BASE",
		"ANTHROPIC_BASE_URL", "GEMINI_BASE_URL", "DEEPSEEK_BASE_URL",
		"MIDJOURNEY_BASE_URL", "COMFYUI_BASE_URL",
		"ONEAPI_BASE_URL", "NEWAPI_BASE_URL",
	} {
		raw := strings.TrimSpace(os.Getenv(key))
		if raw == "" {
			continue
		}
		raw = strings.TrimPrefix(strings.TrimPrefix(raw, "https://"), "http://")
		raw = strings.Split(raw, "/")[0]
		raw = strings.Split(raw, ":")[0]
		if raw != "" {
			hosts = append(hosts, strings.ToLower(raw))
		}
	}
	return hosts
}

func loadProxySuffixes(root string) []string {
	proxySuffixes.Lock()
	defer proxySuffixes.Unlock()
	if proxySuffixes.root == root && proxySuffixes.values != nil {
		return proxySuffixes.values
	}
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/data/remote-host-suffixes.json"))
	payload := struct {
		Suffixes []string `json:"suffixes"`
	}{}
	if err == nil {
		_ = json.Unmarshal(raw, &payload)
	}
	proxySuffixes.root = root
	proxySuffixes.values = payload.Suffixes
	return payload.Suffixes
}
