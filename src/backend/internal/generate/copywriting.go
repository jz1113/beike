package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func Copywriting(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			writeCopyFallback(w, map[string]any{})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeCopyFallback(w, map[string]any{})
			return
		}
		var ok bool
		r, ok = BindTextProtocol(w, r, payload)
		if !ok {
			return
		}
		if copyNeedsUpstream(cfg, r, payload) {
			runCopywriting(cfg, w, r, payload)
			return
		}
		writeCopyFallback(w, payload)
	})
}

func copyNeedsUpstream(cfg config.Config, r *http.Request, payload map[string]any) bool {
	model, _ := payload["model"].(string)
	if strings.HasPrefix(strings.TrimSpace(model), "deepseek-official:") {
		return true
	}
	if strings.TrimSpace(StringField(payload, "customApiKey")) != "" || strings.TrimSpace(r.Header.Get("x-custom-api-key")) != "" {
		return true
	}
	if strings.TrimSpace(StringField(payload, "customBaseUrl")) != "" || strings.TrimSpace(r.Header.Get("x-custom-base-url")) != "" {
		return true
	}
	if cfg.Production() {
		return false
	}
	return strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY")) != "" || strings.TrimSpace(os.Getenv("AI_API_KEY")) != ""
}

func writeCopyFallback(w http.ResponseWriter, payload map[string]any) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"data":         localCopy(payload),
		"fromFallback": true,
	})
}

func localCopy(payload map[string]any) map[string]any {
	name := sanitizeProductTitle(StringField(payload, "productTitle"))
	return map[string]any{
		"title":   formatCleanTitle(name+"商品资料", name, StringListField(payload, "existingTitles")),
		"content": strings.TrimSpace(StringField(payload, "productTitle")),
		"tags":    []string{},
	}
}

var (
	promoPattern   = regexp.MustCompile(`(?i)202\d|2026|新款|爆款|老坑|a货|A货|正品|专柜|同款|顶级|天然|高品质|包邮|特价|原石|定制|现货|热卖|推荐|旗舰店|男女款|女款|男款|秋冬|春夏|女装|男装`)
	bracketPattern = regexp.MustCompile(`【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)`)
	keepPattern    = regexp.MustCompile(`[^\p{Han}a-zA-Z0-9\s]`)
	emojiPattern   = regexp.MustCompile(`[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F2FF}\x{2600}-\x{27BF}\x{FE00}-\x{FE0F}\x{1F900}-\x{1F9FF}\x{200D}]|[✨📸💎🌿👗💡📌🌸🔥👍❤️🎉💯👏👇👀⭐️⭐💫🌟🎈🕶️☕️🍵]`)
	titleBan       = regexp.MustCompile(`(?i)老坑|a货|A货|正品|专柜|包邮|特价|现货|热卖|男女款`)
)

func sanitizeProductTitle(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return "宝藏单品"
	}
	stripped := bracketPattern.ReplaceAllString(raw, " ")
	stripped = promoPattern.ReplaceAllString(stripped, " ")
	stripped = keepPattern.ReplaceAllString(stripped, " ")
	stripped = strings.TrimSpace(stripped)
	tokens := strings.Fields(stripped)
	core := stripped
	if len(tokens) > 0 {
		end := 2
		if len(tokens) < 2 {
			end = len(tokens)
		}
		core = strings.Join(tokens[:end], "")
	}
	if core == "" {
		core = stripped
	}
	name := utf16Slice(core, 6)
	if name == "" {
		return "这件好物"
	}
	return name
}

func formatCleanTitle(raw, defaultName string, existing []string) string {
	title := stripEmojis(raw)
	title = strings.Trim(title, "“\"「『【”\"」』】")
	title = strings.Join(strings.Fields(title), "")
	title = titleBan.ReplaceAllString(title, "")
	title = strings.TrimSpace(title)
	if title == "" || Utf16Len(title) < 5 {
		title = defaultName + "商品细节"
	}
	if Utf16Len(title) > 20 {
		title = utf16Slice(title, 20)
	}
	if len(existing) > 0 && containsString(existing, title) {
		hooks := []string{"商品细节", "外观与设计", "款式介绍"}
		for _, hook := range hooks {
			candidate := utf16Slice(hook+"关于"+defaultName, 20)
			if !containsString(existing, candidate) {
				return candidate
			}
		}
	}
	return title
}

func stripEmojis(text string) string {
	if text == "" {
		return ""
	}
	return strings.TrimSpace(emojiPattern.ReplaceAllString(text, ""))
}

func Utf16Len(value string) int {
	units := 0
	for _, r := range value {
		if r > 0xFFFF {
			units += 2
			continue
		}
		units++
	}
	return units
}

func utf16Slice(value string, max int) string {
	units := 0
	for _, r := range value {
		width := 1
		if r > 0xFFFF {
			width = 2
		}
		if units+width > max {
			break
		}
		units += width
	}
	count := 0
	used := 0
	for _, r := range value {
		width := 1
		if r > 0xFFFF {
			width = 2
		}
		if used+width > units {
			break
		}
		used += width
		count++
	}
	runes := []rune(value)
	if count > len(runes) {
		count = len(runes)
	}
	return string(runes[:count])
}

func StringField(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func IntField(payload map[string]any, key string) int {
	if val, ok := payload[key]; ok {
		switch v := val.(type) {
		case float64:
			return int(v)
		case int:
			return v
		case json.Number:
			if i, err := v.Int64(); err == nil {
				return int(i)
			}
		}
	}
	return 0
}

func StringListField(payload map[string]any, key string) []string {
	items, _ := payload[key].([]any)
	out := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if ok {
			out = append(out, text)
		}
	}
	return out
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
