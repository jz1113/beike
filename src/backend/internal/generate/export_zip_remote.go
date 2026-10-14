package generate

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

func normalizeExportRemote(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "//") {
		return "https:" + raw
	}
	return raw
}

func exportRemoteRefusal(cfg config.Config, raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		if err != nil || parsed == nil || parsed.Scheme == "" || !strings.Contains(raw, "://") {
			return errors.New("Invalid URL")
		}
		return errors.New("Host not allowed")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("Only http(s) URLs allowed")
	}
	if cfg.Production() && parsed.Scheme != "https" {
		return errors.New("Only https URLs allowed in production")
	}
	host := strings.ToLower(strings.Trim(strings.TrimSuffix(parsed.Hostname(), "."), "[]"))
	if host == "" || exportBlockedHost(host) || network.PrivateIP(host) {
		return errors.New("Host not allowed")
	}
	if !system.RemoteHostAllowed(cfg, host) {
		return errors.New("Host not allowed: " + host)
	}
	if parsed.User != nil {
		return errors.New("地址不得包含账号或密码")
	}
	return nil
}

func exportBlockedHost(host string) bool {
	switch host {
	case "localhost", "metadata.google.internal", "metadata", "0.0.0.0":
		return true
	default:
		return false
	}
}

func exportClient(cfg config.Config) *http.Client {
	client := network.SafeClient()
	client.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("stopped after 3 redirects")
		}
		if err := exportRemoteRefusal(cfg, request.URL.String()); err != nil {
			return err
		}
		return nil
	}
	return client
}

func exportSafeError(err error) error {
	var wrapped *url.Error
	if errors.As(err, &wrapped) && wrapped.Err != nil {
		err = wrapped.Err
	}
	if exportFailureKept(err.Error()) && !strings.HasPrefix(err.Error(), "下载失败（HTTP ") && !strings.HasPrefix(err.Error(), "媒体文件超过 ") {
		return err
	}
	return nil
}

func exportFailureKept(text string) bool {
	switch {
	case strings.HasPrefix(text, "下载失败（HTTP "):
		return true
	case strings.HasPrefix(text, "Host not allowed"):
		return true
	case strings.HasPrefix(text, "媒体文件超过 "):
		return true
	case text == "下载地址返回了错误页面或非媒体文件":
		return true
	case text == "下载地址仅返回部分文件，无法打包完整媒体":
		return true
	case text == "媒体文件为空":
		return true
	case text == "Only http(s) URLs allowed":
		return true
	case text == "Only https URLs allowed in production":
		return true
	case text == "Invalid URL":
		return true
	case text == "地址不得包含账号或密码":
		return true
	case text == "Resolved to private IP":
		return true
	case text == "DNS lookup failed for host":
		return true
	case text == "浏览器临时媒体需要先保存到媒体库再打包":
		return true
	default:
		return false
	}
}
