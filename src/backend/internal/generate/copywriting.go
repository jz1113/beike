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
	titleText := StringField(payload, "productTitle")
	role := StringField(payload, "productRole")
	name := sanitizeProductTitle(titleText)
	existing := StringListField(payload, "existingTitles")
	source := titleText + " " + role
	var title, content string
	switch {
	case jewelryPattern.MatchString(source):
		title = formatCleanTitle("原图直出关于这只"+name+"的真实体验", name, existing)
		content = "收到特意实测佩戴了一周才来写这篇分享，无滤镜自然光实拍，给大家整理了一份真实的自用体验。\n\n水头温润清亮，边缘打磨平整顺滑，没有任何粗糙割手的毛刺。在自然漫反射光线下有自然的弱光泽，圈口尺寸标准，贴合手腕曲线。\n\n日常上班搭配深色西装或者浅色针织衫都很出片，上手特别显白提气色，而且轻盈完全不压手。\n\n日常运动或者洗澡时建议摘下妥善存放，避免剧烈磕碰。对于注重质感和百搭性的朋友来说确实很值得入手。"
	case apparelPattern.MatchString(source):
		title = formatCleanTitle("实穿一周这件"+name+"做工版型自用实测", name, existing)
		content = "收到洗过也实穿了一周，原图直出无美颜滤镜，给姐妹们做个真诚的自用实测分享。\n\n面料摸上去细腻顺滑，亲肤透气，洗后悬挂晾干垂感依然在线，不容易起静电或起球，领口和下摆走线做工工整。\n\n版型剪裁立体，对假胯宽和手臂线条包容度极好，腰线位置恰到好处，视觉上能很好地修饰身材比例。\n\n尺码很正，按日常正常码入手即可；建议轻柔手洗或套洗衣袋机洗，能更好地延长挺括寿命。"
	default:
		title = formatCleanTitle("实测这件"+name+"整体质感真的超预期", name, existing)
		content = "收到开箱实测了一段时间才来分享真实体验，做工和质感确实超出预期。\n\n表面是细腻的哑光质感，边缘接缝处理严丝合缝，握持手感非常扎实轻便，完全没有廉价塑料感，外观极简耐看。\n\n日常通勤、办公或随身携带都很顺手，放在桌面上也很利落，极大提升了日常生活的便利与幸福感。\n\n实物质感比网图还要耐看，对于注重便携与品质感的朋友来说非常值得推荐，性价比很扎实。"
	}
	return map[string]any{
		"title":   title,
		"content": content,
		"tags":    []string{"#小红书买家秀", "#真实好物分享", "#自用好物推荐", "#我的日常穿搭", "#真实测评"},
	}
}

var (
	jewelryPattern = regexp.MustCompile(`(?i)手镯|手链|玉|翡翠|项链|戒指|耳环|首饰|饰品|手表|腕表`)
	apparelPattern = regexp.MustCompile(`(?i)裙|衣|裤|外套|衬衫|西装|毛衣|针织|卫衣|背心|风衣`)
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
		title = "实测这件" + defaultName + "质感超出预期"
	}
	if Utf16Len(title) > 20 {
		title = utf16Slice(title, 20)
	}
	if len(existing) > 0 && containsString(existing, title) {
		hooks := []string{"真实自用分享", "实穿细节复盘", "无滤镜开箱实测", "日常搭配心得", "做工质感实测", "私服出镜记录", "真诚选购建议"}
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
